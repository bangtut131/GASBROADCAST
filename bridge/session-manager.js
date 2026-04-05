/**
 * Baileys Session Manager — v6.x compatible
 * Fixed: reconnect does NOT delete credentials (was causing QR loop on 515 restartRequired)
 */

import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    generateWAMessageFromContent,
    prepareWAMessageMedia,
    downloadMediaMessage
} from '@whiskeysockets/baileys';
import { existsSync, mkdirSync, rmSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import QRCode from 'qrcode';
import axios from 'axios';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SESSIONS_DIR = process.env.SESSIONS_DIR || join(__dirname, 'sessions');
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const API_SECRET = process.env.API_SECRET || 'bridge-secret';

// Silent logger
const logger = pino({ level: 'silent' });

// In-memory session registry
const sessions = new Map();

if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });

// ==================== Session Lifecycle ====================

/**
 * Create (or reconnect) a Baileys session.
 * IMPORTANT: Does NOT delete credentials on reconnect — preserving auth state
 * so WhatsApp does not ask for QR again after 515/restartRequired.
 */
export async function createSession(sessionId) {
    // If already connected, skip
    if (sessions.has(sessionId)) {
        const existing = sessions.get(sessionId);
        if (existing.status === 'connected') {
            return { status: 'already_connected' };
        }
        // Only close the socket — do NOT delete session dir (credentials must survive)
        if (existing.socket) {
            try { existing.socket.end(undefined); } catch { }
        }
        sessions.delete(sessionId);
    }

    const sessionDir = join(SESSIONS_DIR, sessionId);
    if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });

    let state, saveCreds;
    try {
        const authState = await useMultiFileAuthState(sessionDir);
        state = authState.state;
        saveCreds = authState.saveCreds;
    } catch (e) {
        console.error(`[${sessionId}] Auth state error:`, e.message);
        return { status: 'error', error: e.message };
    }

    let version;
    try {
        const v = await fetchLatestBaileysVersion();
        version = v.version;
        console.log(`[${sessionId}] Using WA version: ${version.join('.')}`);
    } catch {
        version = [2, 3000, 1023141204]; // Known-good fallback
        console.log(`[${sessionId}] Using fallback WA version: ${version.join('.')}`);
    }

    const sessionData = {
        sessionId,
        status: 'starting',
        qr: null,
        qrBase64: null,
        phoneNumber: null,
        socket: null,
        deviceContacts: new Set(), // Auto-collected from device's phone book
        qrRetryCount: 0, // Track how many QR cycles without scan
    };
    sessions.set(sessionId, sessionData);

    // ==================== Persistent Message Store ====================
    // Saves message content to disk per session for Baileys retry (getMessage handler)
    // Without this, in-memory store is lost on restart → Bad MAC on subsequent msgs
    const storePath = join(sessionDir, 'msg-store.json');
    let storeObj = {};
    try {
        if (existsSync(storePath)) {
            storeObj = JSON.parse(readFileSync(storePath, 'utf8'));
            console.log(`[${sessionId}] Loaded ${Object.keys(storeObj).length} messages from disk store`);
        }
    } catch (e) { storeObj = {}; }

    let saveTimer = null;
    const scheduleSave = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try {
                // Keep only last 200 messages to avoid bloat
                const keys = Object.keys(storeObj);
                if (keys.length > 200) {
                    const oldest = keys.slice(0, keys.length - 200);
                    oldest.forEach(k => delete storeObj[k]);
                }
                writeFileSync(storePath, JSON.stringify(storeObj), 'utf8');
            } catch { }
        }, 1000);
    };

    const messageStore = {
        get: (key) => storeObj[key] || null,
        set: (key, val) => {
            storeObj[key] = val;
            scheduleSave();
        },
    };

    // ==================== Persistent LID Mapping Store ====================
    // Maps @lid to @s.whatsapp.net so we can identify senders of multi-device messages
    const lidStorePath = join(sessionDir, 'lid-store.json');
    let lidObj = {};
    try {
        if (existsSync(lidStorePath)) {
            lidObj = JSON.parse(readFileSync(lidStorePath, 'utf8'));
            console.log(`[${sessionId}] Loaded ${Object.keys(lidObj).length} LID mappings from disk`);
        }
    } catch (e) { lidObj = {}; }

    let lidSaveTimer = null;
    const scheduleLidSave = () => {
        if (lidSaveTimer) clearTimeout(lidSaveTimer);
        lidSaveTimer = setTimeout(() => {
            try { writeFileSync(lidStorePath, JSON.stringify(lidObj), 'utf8'); } catch { }
        }, 2000);
    };

    const lidStore = {
        get: (lid) => lidObj[lid] || null,
        set: (lid, jid) => {
            if (lidObj[lid] === jid) return;
            lidObj[lid] = jid;
            scheduleLidSave();
        },
    };

    // In-memory store for message retry (required for Signal Protocol session renegotiation)
    // Without this, only the first message per contact can be decrypted
    const msgRetryCounterMap = new Map();
    const msgRetryCounterCache = {
        get: (key) => msgRetryCounterMap.get(key) || 0,
        set: (key, val) => msgRetryCounterMap.set(key, val),
    };

    let sock;
    try {
        sock = makeWASocket({
            version,
            auth: state,
            logger,
            printQRInTerminal: false,
            browser: ['Ubuntu', 'Chrome', '124.0.0'],
            generateHighQualityLinkPreview: false,
            connectTimeoutMs: 180_000,        // 3 min — also used as relay timeout for status broadcast
            defaultQueryTimeoutMs: 180_000,   // 3 min — prevents "Timed Out" on 100+ contact statusJidList
            keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 2000,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            shouldSyncHistoryMessage: () => true,
            // Required for Signal Protocol session renegotiation (fixes "Bad MAC" / only 1 message per session)
            msgRetryCounterCache,
            getMessage: async (key) => {
                // Return stored message or a placeholder so Baileys can retry decryption
                const stored = messageStore.get(`${key.remoteJid}:${key.id}`);
                return stored || { conversation: '' };
            },
        });
    } catch (e) {
        console.error(`[${sessionId}] Socket creation failed:`, e.message);
        sessions.delete(sessionId);
        return { status: 'error', error: e.message };
    }

    sessionData.socket = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            sessionData.qrRetryCount = (sessionData.qrRetryCount || 0) + 1;
            const MAX_QR_RETRIES = 5; // Stop after 5 QR cycles (~100s) to prevent zombie sessions
            if (sessionData.qrRetryCount > MAX_QR_RETRIES) {
                console.log(`[${sessionId}] ⛔ QR not scanned after ${MAX_QR_RETRIES} attempts — stopping session to save resources`);
                sessionData.status = 'qr_timeout';
                try { sock.end(undefined); } catch {}
                return; // Don't reconnect — user must manually re-add device
            }
            try {
                const qrBase64 = await QRCode.toDataURL(qr);
                sessionData.qr = qr;
                sessionData.qrBase64 = qrBase64;
                sessionData.status = 'qr';
                console.log(`[${sessionId}] QR ready — scan now (attempt ${sessionData.qrRetryCount}/${MAX_QR_RETRIES})`);
            } catch (e) {
                console.error(`[${sessionId}] QR generation error:`, e.message);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(`[${sessionId}] Closed. Code: ${statusCode}. Reconnect: ${shouldReconnect}`);

            // Don't reconnect if QR timed out (zombie prevention)
            if (sessionData.status === 'qr_timeout') {
                console.log(`[${sessionId}] ⛔ Not reconnecting — QR timeout (zombie prevention)`);
                return;
            }

            if (shouldReconnect) {
                sessionData.status = 'reconnecting';
                sessionData.qr = null;
                sessionData.qrBase64 = null;
                // Reconnect without deleting credentials — auth state is preserved on disk
                setTimeout(() => {
                    createSession(sessionId).catch(err =>
                        console.error(`[${sessionId}] Reconnect failed:`, err.message)
                    );
                }, 3000);
            } else {
                // loggedOut — clean up everything
                console.log(`[${sessionId}] Logged out. Cleaning up.`);
                sessions.delete(sessionId);
                const dir = join(SESSIONS_DIR, sessionId);
                if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
                await sendWebhook(sessionId, 'session.disconnected', { sessionId });
            }
        }

        if (connection === 'open') {
            const user = sock.user;
            sessionData.status = 'connected';
            sessionData.qr = null;
            sessionData.qrBase64 = null;
            sessionData.qrRetryCount = 0; // Reset QR counter on successful connect
            sessionData.phoneNumber = user?.id ? user.id.split(':')[0] : null;
            console.log(`[${sessionId}] ✅ Connected! +${sessionData.phoneNumber}`);
            await sendWebhook(sessionId, 'session.connected', {
                sessionId,
                phoneNumber: sessionData.phoneNumber,
            });
        }
    });

    // Deduplication: track recently processed message IDs to prevent duplicate webhook calls
    const processedMsgIds = new Set();
    const DEDUP_MAX = 500;

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // Store ALL messages for getMessage retry support (needed for Signal Protocol renegotiation)
        for (const msg of messages) {
            if (msg.message && msg.key?.remoteJid && msg.key?.id) {
                messageStore.set(`${msg.key.remoteJid}:${msg.key.id}`, msg.message);
            }
        }

        // Log ALL events including non-notify types for debugging
        console.log(`[${sessionId}] messages.upsert type=${type} count=${messages.length} fromMe=${messages[0]?.key?.fromMe} from=${messages[0]?.key?.remoteJid}`);

        if (type !== 'notify') return;
        for (const msg of messages) {
            // Do NOT continue if fromMe; we want to capture manual replies from the device as well.
            const isFromMe = msg.key.fromMe;
            const from = msg.key.remoteJid;
            if (!from || from.endsWith('@g.us') || from === 'status@broadcast') continue;

            // Dedup: skip if already processed
            const msgId = msg.key.id;
            if (processedMsgIds.has(msgId)) {
                console.log(`[${sessionId}] ⏭️ Skipping duplicate message ${msgId}`);
                continue;
            }
            processedMsgIds.add(msgId);
            // Keep set from growing unbounded
            if (processedMsgIds.size > DEDUP_MAX) {
                const first = processedMsgIds.values().next().value;
                processedMsgIds.delete(first);
            }

            // Allow @lid (Linked Device IDs) because Multi-Device uses this for subsequent messages

            // Extract body — handle all known message types including nested wrappers
            const m = msg.message;
            const body =
                m?.conversation ||
                m?.extendedTextMessage?.text ||
                m?.imageMessage?.caption ||
                m?.videoMessage?.caption ||
                m?.documentMessage?.caption ||
                m?.ephemeralMessage?.message?.conversation ||
                m?.ephemeralMessage?.message?.extendedTextMessage?.text ||
                m?.viewOnceMessage?.message?.conversation ||
                m?.viewOnceMessageV2?.message?.imageMessage?.caption ||
                m?.buttonsResponseMessage?.selectedDisplayText ||
                m?.listResponseMessage?.title ||
                m?.templateButtonReplyMessage?.selectedDisplayText ||
                '';

            // Clean phone number
            let fromJid = from;
            
            // If it's an @lid, try to resolve to real JID
            if (from.endsWith('@lid')) {
                // Multi-Device often sends the true phone number in `key.senderPn`
                if (msg.key && msg.key.senderPn) {
                    console.log(`[${sessionId}] Resolved LID ${from} from senderPn -> ${msg.key.senderPn}`);
                    fromJid = msg.key.senderPn;
                } else {
                    const resolved = lidStore.get(from);
                    if (resolved) {
                        console.log(`[${sessionId}] Resolved LID ${from} from lidStore -> ${resolved}`);
                        fromJid = resolved;
                    } else if (msg.participant || msg.key.participant) {
                        // Fallback to participant if available
                        fromJid = msg.participant || msg.key.participant;
                    }
                }
            }

            const phone = fromJid
                .replace('@s.whatsapp.net', '')
                .replace('@lid', '')
                .trim();

            const direction = isFromMe ? 'outbound' : 'inbound';
            console.log(`[${sessionId}] 📨 ${direction} Message with ${phone} (raw: ${from}): "${body.substring(0, 60)}" type=${type}`);

            // Download media if present
            let mediaUrl = null;
            const msgType = getMessageType(msg);
            if (msgType !== 'text' && msg.message) {
                try {
                    const buffer = await downloadMediaMessage(msg, 'buffer', {});
                    if (buffer && buffer.length > 0) {
                        // Get MIME type
                        const mimeMap = {
                            image: msg.message?.imageMessage?.mimetype || 'image/jpeg',
                            video: msg.message?.videoMessage?.mimetype || 'video/mp4',
                            audio: msg.message?.audioMessage?.mimetype || 'audio/ogg',
                            document: msg.message?.documentMessage?.mimetype || 'application/octet-stream',
                        };
                        const mime = mimeMap[msgType] || 'application/octet-stream';
                        mediaUrl = `data:${mime};base64,${buffer.toString('base64')}`;
                        console.log(`[${sessionId}] 📎 Downloaded media: ${msgType} (${(buffer.length / 1024).toFixed(1)}KB)`);
                    }
                } catch (mediaErr) {
                    console.error(`[${sessionId}] ⚠️ Media download failed:`, mediaErr.message);
                }
            }

            await sendWebhook(sessionId, 'message.received', {
                sessionId,
                payload: {
                    id: msg.key.id,
                    from: phone,
                    body,
                    type: msgType,
                    timestamp: msg.messageTimestamp,
                    mediaUrl,
                    direction,
                    _rawMessage: msg.message || null
                },
            });
        }
    });

    // Collect device contacts for WA Status broadcasting
    // Listen to multiple events since different Baileys versions emit different ones
    sock.ev.on('contacts.upsert', (contactsList) => {
        for (const contact of contactsList) {
            if (contact.id && contact.id.endsWith('@s.whatsapp.net')) {
                sessionData.deviceContacts.add(contact.id);
            }
            // Map LID to JID if both are present in the contact
            const cLid = contact.lid || (contact.id?.endsWith('@lid') ? contact.id : null);
            const cJid = contact.id?.endsWith('@s.whatsapp.net') ? contact.id : null;
            if (cLid && cJid) lidStore.set(cLid, cJid);
        }
        console.log(`[${sessionId}] contacts.upsert: ${sessionData.deviceContacts.size} total device contacts`);
    });

    sock.ev.on('contacts.update', (contactsList) => {
        for (const contact of contactsList) {
            if (contact.id && contact.id.endsWith('@s.whatsapp.net')) {
                sessionData.deviceContacts.add(contact.id);
            }
            const cLid = contact.lid || (contact.id?.endsWith('@lid') ? contact.id : null);
            const cJid = contact.id?.endsWith('@s.whatsapp.net') ? contact.id : null;
            if (cLid && cJid) lidStore.set(cLid, cJid);
        }
        console.log(`[${sessionId}] contacts.update: ${sessionData.deviceContacts.size} total device contacts`);
    });

    // Also collect contacts from history sync (covers initial connection)
    sock.ev.on('messaging-history.set', ({ contacts: historyContacts }) => {
        if (historyContacts) {
            for (const contact of historyContacts) {
                if (contact.id && contact.id.endsWith('@s.whatsapp.net')) {
                    sessionData.deviceContacts.add(contact.id);
                }
            }
            console.log(`[${sessionId}] messaging-history.set: ${sessionData.deviceContacts.size} total device contacts`);
        }
    });

    return { status: 'starting', sessionId };
}

/**
 * Permanently delete a session (user-initiated logout).
 * This DOES delete the credentials directory.
 */
export async function deleteSession(sessionId) {
    const session = sessions.get(sessionId);
    if (session?.socket) {
        try { session.socket.end(undefined); } catch { }
    }
    sessions.delete(sessionId);
    const dir = join(SESSIONS_DIR, sessionId);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

// ==================== Messaging ====================

export async function sendText(sessionId, to, text, contacts = []) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') return { success: false, error: 'Not connected' };
    try {
        const jid = to === 'status@broadcast' ? 'status@broadcast' : formatJid(to);
        // For status@broadcast, use the dedicated sendStatusText function instead
        if (jid === 'status@broadcast') {
            return await sendStatusText(sessionId, text, '#1D4ED8', 1, contacts);
        }
        await session.socket.sendMessage(jid, { text });
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
}

export async function sendImage(sessionId, to, imageUrl, caption = '', contacts = []) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') return { success: false, error: 'Not connected' };
    try {
        const jid = to === 'status@broadcast' ? 'status@broadcast' : formatJid(to);
        if (jid === 'status@broadcast') {
            return await sendStatusImage(sessionId, imageUrl, caption, contacts);
        }
        await session.socket.sendMessage(jid, { image: { url: imageUrl }, caption });
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
}

export async function sendVideo(sessionId, to, videoUrl, caption = '', contacts = []) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') return { success: false, error: 'Not connected' };
    try {
        const jid = to === 'status@broadcast' ? 'status@broadcast' : formatJid(to);
        if (jid === 'status@broadcast') {
            return await sendStatusVideo(sessionId, videoUrl, caption, contacts);
        }
        await session.socket.sendMessage(jid, { video: { url: videoUrl }, caption });
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
}

// ==================== WA Status (Story) ====================
// Dedicated status functions — these use the WAHA-compatible approach
// which correctly posts to the Status/Story tab rather than sending DMs

export async function sendStatusText(sessionId, text, backgroundColor = '#1D4ED8', font = 1, contacts = []) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') return { success: false, error: 'Not connected' };
    try {
        // Build statusJidList: sender JID + all device contacts + any extra contacts
        const statusJids = buildStatusJidList(session, contacts);

        await session.socket.sendMessage('status@broadcast', {
            text,
            backgroundColor,
            font: font || 1,
        }, {
            statusJidList: statusJids,
        });

        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
}

export async function sendStatusImage(sessionId, imageUrl, caption = '', contacts = []) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') return { success: false, error: 'Not connected' };
    try {
        const statusJids = buildStatusJidList(session, contacts);

        await session.socket.sendMessage('status@broadcast', {
            image: { url: imageUrl },
            caption: caption || undefined,
        }, {
            statusJidList: statusJids,
        });

        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
}

export async function sendStatusVideo(sessionId, videoUrl, caption = '', contacts = []) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') return { success: false, error: 'Not connected' };
    try {
        const statusJids = buildStatusJidList(session, contacts);

        await session.socket.sendMessage('status@broadcast', {
            video: { url: videoUrl },
            caption: caption || undefined,
        }, {
            statusJidList: statusJids,
        });

        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
}

// ====== Batch status posting (download media ONCE, send to multiple devices) ======

// Max concurrent device sends (1 = serial, prevents bandwidth/CPU saturation)
const MAX_CONCURRENT_SENDS = 1;
// Chunked relay: send to contacts in small batches to avoid Baileys encryption timeout
const CHUNK_SIZE = 10;         // 10 contacts per relay
const CHUNK_TIMEOUT = 30_000;  // 30 seconds timeout per chunk
const CHUNK_DELAY = 2000;      // 2 seconds between chunks

async function downloadMedia(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

// Compress image to max 1080px wide, 80% quality JPEG — reduces 4MB to ~200-400KB
async function compressImage(buffer) {
    try {
        const sharp = (await import('sharp')).default;
        const compressed = await sharp(buffer)
            .resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
        console.log(`[Batch] Compressed image: ${(buffer.length / 1024).toFixed(0)}KB → ${(compressed.length / 1024).toFixed(0)}KB`);
        return compressed;
    } catch (err) {
        console.warn(`[Batch] sharp not available, using original image: ${err.message}`);
        return buffer; // fallback: use original if sharp fails
    }
}

// Timeout wrapper: rejects after ms milliseconds
function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s`)), ms)),
    ]);
}

// Throttled parallel: runs at most `limit` tasks concurrently
async function throttledAll(tasks, limit) {
    const results = [];
    let idx = 0;
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
        while (idx < tasks.length) {
            const i = idx++;
            results[i] = await tasks[i]();
        }
    });
    await Promise.all(workers);
    return results;
}

// ===== Hybrid Chunked Status Relay =====
// HYBRID APPROACH: sendMessage to self (registers on phone) + relayMessage chunks (distributes to contacts)
// - Step 1: sock.sendMessage → sender's own JID only → phone sees "My Status" ✅
// - Step 2: sock.relayMessage → chunks of CHUNK_SIZE → all other contacts get it ✅
// - Media uploaded ONCE via sendMessage, reused for relay (no double upload)
async function chunkedStatusRelay(sock, mediaContent, allJids, sessionId) {
    // buildStatusJidList always puts myJid first
    const myJid = allJids[0];
    const otherJids = allJids.slice(1);

    let sent = 0;
    let failed = 0;

    // ── Step 1: sendMessage to sender's own JID ──────────────────────────
    // This is the HIGH-LEVEL Baileys API that properly triggers WhatsApp's
    // internal "status posted" protocol, making it visible in "My Status" on the phone.
    // It also uploads media to WA CDN — we reuse that for relay (no double upload).
    let sentMsg = null;
    try {
        sentMsg = await withTimeout(
            sock.sendMessage('status@broadcast', mediaContent, {
                statusJidList: [myJid],
            }),
            CHUNK_TIMEOUT,
            `${sessionId}-self`
        );
        sent += 1;
        console.log(`[${sessionId}] ✅ Status registered on sender device via sendMessage (${myJid})`);
    } catch (err) {
        failed += 1;
        console.error(`[${sessionId}] ⚠️ Failed to register status on sender device: ${err.message}`);
    }

    // If no other contacts, we're done
    if (otherJids.length === 0) {
        console.log(`[${sessionId}] 📊 Result: ${sent} sent, ${failed} failed out of ${allJids.length}`);
        return { sent, failed, total: allJids.length };
    }

    // ── Step 2: Build message content for relay ──────────────────────────
    // If sendMessage succeeded, reuse its uploaded media (has CDN URLs already).
    // If it failed, upload fresh via prepareWAMessageMedia as fallback.
    let msgContent;
    if (sentMsg?.message) {
        msgContent = sentMsg.message;
        console.log(`[${sessionId}] ♻️ Reusing media from sendMessage (no re-upload needed)`);
    } else {
        const mediaMsg = await prepareWAMessageMedia(mediaContent, { upload: sock.waUploadToServer });
        msgContent = {};
        if (mediaMsg.imageMessage) {
            msgContent.imageMessage = { ...mediaMsg.imageMessage };
            if (mediaContent.caption) msgContent.imageMessage.caption = mediaContent.caption;
        } else if (mediaMsg.videoMessage) {
            msgContent.videoMessage = { ...mediaMsg.videoMessage };
            if (mediaContent.caption) msgContent.videoMessage.caption = mediaContent.caption;
        }
        console.log(`[${sessionId}] 📤 Fresh media upload to CDN (sendMessage fallback)`);
    }

    // ── Step 3: Generate message proto for relay ─────────────────────────
    const msg = generateWAMessageFromContent('status@broadcast', msgContent, {
        userJid: sock.user.id,
    });

    const totalChunks = Math.ceil(otherJids.length / CHUNK_SIZE);
    console.log(`[${sessionId}] 📤 Relaying to ${otherJids.length} other contacts in ${totalChunks} chunks of ${CHUNK_SIZE}...`);

    // ── Step 4: Relay in chunks (low-level, fast, no timeout) ────────────
    for (let i = 0; i < otherJids.length; i += CHUNK_SIZE) {
        const chunk = otherJids.slice(i, i + CHUNK_SIZE);
        const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
        try {
            await withTimeout(
                sock.relayMessage('status@broadcast', msg.message, {
                    messageId: msg.key.id,
                    statusJidList: chunk,
                }),
                CHUNK_TIMEOUT,
                `${sessionId}-chunk${chunkNum}`
            );
            sent += chunk.length;
            console.log(`[${sessionId}] ✅ Chunk ${chunkNum}/${totalChunks}: ${chunk.length} contacts (total: ${sent}/${allJids.length})`);
        } catch (err) {
            failed += chunk.length;
            console.error(`[${sessionId}] ⚠️ Chunk ${chunkNum}/${totalChunks} failed: ${err.message} (${chunk.length} skipped)`);
        }
        // Delay between chunks to avoid overwhelming WA server
        if (i + CHUNK_SIZE < otherJids.length) {
            await new Promise(r => setTimeout(r, CHUNK_DELAY));
        }
    }

    console.log(`[${sessionId}] 📊 Result: ${sent} sent, ${failed} failed out of ${allJids.length}`);
    return { sent, failed, total: allJids.length };
}

export async function batchSendStatusImage(mediaUrl, caption, deviceEntries) {
    const rawBuffer = await downloadMedia(mediaUrl);
    const buffer = await compressImage(rawBuffer);
    console.log(`[Batch] Sending ${(buffer.length / 1024).toFixed(0)}KB image to ${deviceEntries.length} devices (${MAX_CONCURRENT_SENDS} at a time)...`);

    const tasks = deviceEntries.map((entry) => async () => {
        const { sessionId, contacts } = entry;
        const session = sessions.get(sessionId);
        if (!session || session.status !== 'connected') {
            console.log(`[Batch] ⏭️ ${sessionId} skipped (not connected)`);
            return { sessionId, success: false, error: 'Not connected' };
        }
        try {
            const statusJids = buildStatusJidList(session, contacts || []);
            console.log(`[Batch] ⏳ ${sessionId} posting to ${statusJids.length} contacts...`);
            const result = await chunkedStatusRelay(
                session.socket,
                { image: buffer, caption: caption || undefined },
                statusJids,
                sessionId
            );
            if (result.sent > 0) {
                console.log(`[Batch] ✅ ${sessionId}: ${result.sent}/${result.total} contacts reached`);
                return { sessionId, success: true, sent: result.sent, total: result.total };
            } else {
                console.error(`[Batch] ❌ ${sessionId}: All ${result.total} chunks failed`);
                return { sessionId, success: false, error: 'All chunks failed' };
            }
        } catch (err) {
            console.error(`[Batch] ❌ ${sessionId}: ${err.message}`);
            return { sessionId, success: false, error: err.message };
        }
    });

    return await throttledAll(tasks, MAX_CONCURRENT_SENDS);
}

export async function batchSendStatusVideo(mediaUrl, caption, deviceEntries) {
    const buffer = await downloadMedia(mediaUrl);
    console.log(`[Batch] Sending ${(buffer.length / 1024).toFixed(0)}KB video to ${deviceEntries.length} devices (${MAX_CONCURRENT_SENDS} at a time)...`);

    const tasks = deviceEntries.map((entry) => async () => {
        const { sessionId, contacts } = entry;
        const session = sessions.get(sessionId);
        if (!session || session.status !== 'connected') {
            console.log(`[Batch] ⏭️ ${sessionId} skipped (not connected)`);
            return { sessionId, success: false, error: 'Not connected' };
        }
        try {
            const statusJids = buildStatusJidList(session, contacts || []);
            console.log(`[Batch] ⏳ ${sessionId} posting to ${statusJids.length} contacts...`);
            const result = await chunkedStatusRelay(
                session.socket,
                { video: buffer, caption: caption || undefined },
                statusJids,
                sessionId
            );
            if (result.sent > 0) {
                console.log(`[Batch] ✅ ${sessionId}: ${result.sent}/${result.total} contacts reached`);
                return { sessionId, success: true, sent: result.sent, total: result.total };
            } else {
                console.error(`[Batch] ❌ ${sessionId}: All ${result.total} chunks failed`);
                return { sessionId, success: false, error: 'All chunks failed' };
            }
        } catch (err) {
            console.error(`[Batch] ❌ ${sessionId}: ${err.message}`);
            return { sessionId, success: false, error: err.message };
        }
    });

    return await throttledAll(tasks, MAX_CONCURRENT_SENDS);
}

// Build statusJidList: sender's own JID + device contacts + extra contacts
// NO LIMIT — chunkedStatusRelay handles batching in groups of CHUNK_SIZE
function buildStatusJidList(session, extraContacts = []) {
    const myJid = formatJid(session.socket.user.id.split(':')[0]);
    const seen = new Set([myJid]);
    const jids = [myJid];

    // Device contacts (auto-collected from phone book)
    for (const jid of session.deviceContacts || []) {
        if (!seen.has(jid)) { seen.add(jid); jids.push(jid); }
    }

    // Extra contacts from app
    for (const c of extraContacts) {
        const formatted = formatJid(c);
        if (!seen.has(formatted)) { seen.add(formatted); jids.push(formatted); }
    }

    console.log(`[${session.sessionId}] Status JID list: ${jids.length} contacts (chunked relay, no limit)`);
    return jids;
}

// Helper: Convert hex color string to ARGB uint32
function hexToArgb(hex) {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) || 0;
    const g = parseInt(clean.substring(2, 4), 16) || 0;
    const b = parseInt(clean.substring(4, 6), 16) || 0;
    return (0xFF000000 | (r << 16) | (g << 8) | b) >>> 0;
}

// ==================== Session Info ====================

export function getSession(sessionId) {
    const s = sessions.get(sessionId);
    if (!s) return null;
    return { sessionId: s.sessionId, status: s.status, phoneNumber: s.phoneNumber, qrAvailable: !!s.qrBase64 };
}

export function getAllSessions() {
    return Array.from(sessions.values()).map(s => ({
        sessionId: s.sessionId, status: s.status, phoneNumber: s.phoneNumber,
    }));
}

export function getQR(sessionId) {
    return sessions.get(sessionId)?.qrBase64 || null;
}

// ==================== Startup Restore ====================

export async function restorePersistedSessions() {
    if (!existsSync(SESSIONS_DIR)) return;
    // Skip system/filesystem dirs that are not WA sessions
    const SKIP_DIRS = new Set(['lost+found', '.lost+found', 'tmp', '.DS_Store']);
    const dirs = readdirSync(SESSIONS_DIR).filter(d => {
        if (SKIP_DIRS.has(d) || d.startsWith('.')) return false;
        try { return statSync(join(SESSIONS_DIR, d)).isDirectory(); } catch { return false; }
    });
    if (dirs.length === 0) return;
    console.log(`[Bridge] Restoring ${dirs.length} session(s)...`);
    for (const sessionId of dirs) {
        try {
            await createSession(sessionId);
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.error(`[Bridge] Restore failed for ${sessionId}:`, e.message);
        }
    }
}

// ==================== Helpers ====================

function formatJid(phone) {
    if (phone === 'status@broadcast') return 'status@broadcast';
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
    return cleaned + '@s.whatsapp.net';
}

function getMessageType(msg) {
    if (msg.message?.imageMessage) return 'image';
    if (msg.message?.videoMessage) return 'video';
    if (msg.message?.audioMessage) return 'audio';
    if (msg.message?.documentMessage) return 'document';
    return 'text';
}

async function sendWebhook(sessionId, event, data) {
    if (!WEBHOOK_URL) return;
    try {
        await axios.post(WEBHOOK_URL, { sessionId, event, data }, {
            headers: { 'x-api-key': API_SECRET },
            timeout: 5000,
        });
    } catch { /* non-fatal */ }
}
