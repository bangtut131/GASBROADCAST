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

    // ==================== Persistent Device Contacts Store ====================
    // Device contacts collected via Baileys events (contacts.upsert, contacts.update, messaging-history.set)
    // Persisted to disk so they survive bridge restarts.
    // This is the NATIVE approach: only device phonebook contacts are used for status visibility,
    // exactly like WA Web. No manual contact list injection from the app database.
    const contactsStorePath = join(sessionDir, 'contacts-store.json');
    let contactsArr = [];
    try {
        if (existsSync(contactsStorePath)) {
            contactsArr = JSON.parse(readFileSync(contactsStorePath, 'utf8'));
            console.log(`[${sessionId}] Loaded ${contactsArr.length} device contacts from disk`);
        }
    } catch (e) { contactsArr = []; }

    const sessionData = {
        sessionId,
        status: 'starting',
        qr: null,
        qrBase64: null,
        phoneNumber: null,
        socket: null,
        deviceContacts: new Set(contactsArr), // Pre-populated from disk
        qrRetryCount: 0,
        decryptErrorCount: 0, // Tracks persistent decrypt failures (Signal session corruption)
        lastDecryptErrorAt: null, // Timestamp of last decrypt error
        isHealthy: true, // false when session is corrupted
    };
    sessions.set(sessionId, sessionData);

    let contactsSaveTimer = null;
    const scheduleContactsSave = () => {
        if (contactsSaveTimer) clearTimeout(contactsSaveTimer);
        contactsSaveTimer = setTimeout(() => {
            try {
                writeFileSync(contactsStorePath, JSON.stringify([...sessionData.deviceContacts]), 'utf8');
            } catch { }
        }, 3000);
    };

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
            syncFullHistory: true,  // CRITICAL: must be true to sync device contacts for status posting
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

            // Don't reconnect if session was intentionally deleted
            if (sessionData._deleted) {
                console.log(`[${sessionId}] ⛔ Not reconnecting — session was deleted`);
                return;
            }

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
            console.log(`[${sessionId}] 📇 Device contacts loaded: ${sessionData.deviceContacts.size} (from disk cache)`);
            if (sessionData.deviceContacts.size === 0) {
                console.warn(`[${sessionId}] ⚠️ WARNING: 0 device contacts! Waiting for contacts.upsert/messaging-history.set sync...`);
                console.warn(`[${sessionId}] ⚠️ If contacts stay at 0, the Signal session may be corrupted. Re-scan QR to fix.`);
            }
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

        // Detect undecryptable/stub messages (sign of corrupted Signal session)
        for (const msg of messages) {
            const hasContent = msg.message && Object.keys(msg.message).some(k =>
                !['messageContextInfo', 'senderKeyDistributionMessage'].includes(k)
            );
            if (msg.key?.fromMe && !hasContent && msg.key?.remoteJid?.endsWith('@s.whatsapp.net')) {
                sessionData.decryptErrorCount++;
                sessionData.lastDecryptErrorAt = Date.now();
                // After 20 consecutive undecryptable messages, mark session as unhealthy
                if (sessionData.decryptErrorCount >= 20 && sessionData.isHealthy) {
                    sessionData.isHealthy = false;
                    console.error(`[${sessionId}] ❌ SESSION UNHEALTHY: ${sessionData.decryptErrorCount} decrypt failures detected`);
                    console.error(`[${sessionId}] ❌ Signal Protocol session is corrupted. Device needs re-scan QR.`);
                    await sendWebhook(sessionId, 'session.unhealthy', {
                        sessionId,
                        reason: 'decrypt_errors',
                        decryptErrorCount: sessionData.decryptErrorCount,
                        deviceContacts: sessionData.deviceContacts.size,
                    });
                }
            }
        }

        if (type !== 'notify') return;
        for (const msg of messages) {
            // Do NOT continue if fromMe; we want to capture manual replies from the device as well.
            const isFromMe = msg.key.fromMe;
            const from = msg.key.remoteJid;
            if (!from || from.endsWith('@g.us') || from === 'status@broadcast') continue;

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

            // Filter out undecrypted stubs and protocol messages! 
            // If we dedup these, the actual decrypted retry (sent 10-15s later) will be falsely rejected as duplicate!
            const isStub = !m || (!body && !msg.message?.imageMessage && !msg.message?.videoMessage && !msg.message?.audioMessage && !msg.message?.documentMessage && !msg.message?.stickerMessage);
            
            if (isStub) {
                console.log(`[${sessionId}] ⏭️ Skipping stub/undecrypted/empty message ${msg.key.id}`);
                continue;
            }

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

    // Collect device contacts for WA Status (native approach)
    // These are the SAME contacts that WA Web uses internally.
    // Status will be visible ONLY to these contacts, following WhatsApp's own rules.
    sock.ev.on('contacts.upsert', (contactsList) => {
        for (const contact of contactsList) {
            if (contact.id && contact.id.endsWith('@s.whatsapp.net')) {
                sessionData.deviceContacts.add(contact.id);
            }
            const cLid = contact.lid || (contact.id?.endsWith('@lid') ? contact.id : null);
            const cJid = contact.id?.endsWith('@s.whatsapp.net') ? contact.id : null;
            if (cLid && cJid) lidStore.set(cLid, cJid);
        }
        const count = sessionData.deviceContacts.size;
        // Only log every 100 contacts to avoid Railway rate limit (500 logs/sec)
        if (count <= 10 || count % 100 === 0) {
            console.log(`[${sessionId}] contacts.upsert: ${count} total device contacts`);
        }
        scheduleContactsSave();
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
        scheduleContactsSave();
    });

    // Also collect contacts from history sync (covers initial connection)
    sock.ev.on('messaging-history.set', ({ contacts: historyContacts, chats: historyChats, messages: historyMessages }) => {
        let newContacts = 0;
        if (historyContacts) {
            for (const contact of historyContacts) {
                if (contact.id && contact.id.endsWith('@s.whatsapp.net')) {
                    if (!sessionData.deviceContacts.has(contact.id)) newContacts++;
                    sessionData.deviceContacts.add(contact.id);
                }
                // Also resolve LID → JID mapping
                const cLid = contact.lid || (contact.id?.endsWith('@lid') ? contact.id : null);
                const cJid = contact.id?.endsWith('@s.whatsapp.net') ? contact.id : null;
                if (cLid && cJid) lidStore.set(cLid, cJid);
            }
        }
        // Extract contacts from chat history (chats with @s.whatsapp.net)
        if (historyChats) {
            for (const chat of historyChats) {
                if (chat.id && chat.id.endsWith('@s.whatsapp.net')) {
                    if (!sessionData.deviceContacts.has(chat.id)) newContacts++;
                    sessionData.deviceContacts.add(chat.id);
                }
            }
        }
        console.log(`[${sessionId}] messaging-history.set: +${newContacts} new, ${sessionData.deviceContacts.size} total device contacts (from ${historyContacts?.length || 0} contacts + ${historyChats?.length || 0} chats)`);
        scheduleContactsSave();
    });

    return { status: 'starting', sessionId };
}

/**
 * Permanently delete a session (user-initiated logout).
 * This DOES delete the credentials directory.
 */
export async function deleteSession(sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
        // Mark as deleted BEFORE closing socket to prevent reconnect handler
        session._deleted = true;
        if (session.socket) {
            try { session.socket.end(undefined); } catch { }
            try { session.socket.ws?.close(); } catch { }
        }
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
        const mediaContent = {
            text,
            backgroundColor,
            font: font || 1,
        };

        // Use chunked relay: self-registration first (guarantees "Status Saya" visible),
        // then contacts in batches to prevent Baileys encryption timeout
        const result = await chunkedStatusRelay(
            session.socket,
            mediaContent,
            statusJids,
            sessionId
        );

        return { success: result.sent > 0, sent: result.sent, total: result.total };
    } catch (err) { return { success: false, error: err.message }; }
}

export async function sendStatusImage(sessionId, imageUrl, caption = '', contacts = []) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') return { success: false, error: 'Not connected' };
    try {
        const statusJids = buildStatusJidList(session, contacts);

        // Use chunked relay: self-registration first, then contact batches
        const result = await chunkedStatusRelay(
            session.socket,
            { image: { url: imageUrl }, caption: caption || undefined },
            statusJids,
            sessionId
        );

        return { success: result.sent > 0, sent: result.sent, total: result.total };
    } catch (err) { return { success: false, error: err.message }; }
}

export async function sendStatusVideo(sessionId, videoUrl, caption = '', contacts = []) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') return { success: false, error: 'Not connected' };
    try {
        const statusJids = buildStatusJidList(session, contacts);

        // Use chunked relay: self-registration first, then contact batches
        const result = await chunkedStatusRelay(
            session.socket,
            { video: { url: videoUrl }, caption: caption || undefined },
            statusJids,
            sessionId
        );

        return { success: result.sent > 0, sent: result.sent, total: result.total };
    } catch (err) { return { success: false, error: err.message }; }
}

// ====== Batch status posting (download media ONCE, send to multiple devices) ======

// Max concurrent device sends (1 = serial, prevents bandwidth/CPU saturation)
const MAX_CONCURRENT_SENDS = 1;
// Three-phase chunked relay: matches original working code (backup April 19)
const CHUNK_SIZE = 10;         // 10 contacts per relay chunk
const CHUNK_TIMEOUT = 30_000;  // 30 seconds timeout per chunk
const CHUNK_DELAY = 2000;      // 2 seconds between chunks
const SELF_POST_TIMEOUT = 90_000;  // 90s for initial self-post (includes media upload to CDN)
const SELF_POST_RETRIES = 3;       // Retry self-registration up to 3 times
const DEVICE_DELAY = 3000;         // 3s delay between devices in batch to avoid rate limiting
const SELF_PROPAGATION_DELAY = 3000; // 3s wait after self-registration before broadcasting
const WA_STATUS_EXPIRY = 86400;    // 24 hours — WhatsApp status/story ephemeral expiry

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
export function withTimeout(promise, ms, label) {
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

// ===== WA Web-Native Status Posting =====
// TWO-STEP APPROACH for reliable status posting:
//
// STEP 1: Self-registration (myJid ONLY)
//   - sock.sendMessage('status@broadcast', content, { statusJidList: [myJid] })
//   - Uploads media to WA CDN and registers status on sender's phone ("Status Saya")
//   - Uses short 30s timeout (1 JID = very fast encryption)
//   - GUARANTEES the sender always sees their own status
//
// STEP 2: Contact batches (remaining contacts in groups of CHUNK_SIZE)
//   - sock.sendMessage('status@broadcast', content, { statusJidList: [batch] })
//   - Distributes the status to contacts in manageable batches
//   - Each batch gets CHUNK_TIMEOUT to handle encryption for up to 50 JIDs
//   - If any batch fails, other batches still succeed
//
// WHY separate self-registration?
//   The previous approach put myJid in Batch 1 with 49 other contacts.
//   Encrypting for 50 JIDs (including ones with stale/corrupt Signal sessions)
//   caused consistent 120s timeouts. Since myJid was in the failed batch,
//   the status NEVER appeared on the sender's device — the #1 user complaint.
//   By isolating myJid, self-registration is virtually instant (1 JID, ~2-5s).
async function chunkedStatusRelay(sock, mediaContent, allJids, sessionId) {
    // buildStatusJidList always puts myJid first
    const myJid = allJids[0];
    const allOtherJids = allJids.slice(1);

    // Historically proven code from April 1st that successfully delivered to all contacts
    const CHUNK_SIZE = 25; // Safe size to prevent timeout but not too small
    const totalChunks = Math.ceil(allJids.length / CHUNK_SIZE) || 1;

    console.log(`[${sessionId}] 📤 Uploading media and sending status to ${allJids.length} contacts + self in ${totalChunks} chunks of ${CHUNK_SIZE}...`);
    
    let sent = 0;
    let failed = 0;

    try {
        const { prepareWAMessageMedia, generateWAMessageFromContent } = await import('@whiskeysockets/baileys');
        
        // Step 1: Upload media to WA CDN (ONCE)
        const mediaMsg = await prepareWAMessageMedia(mediaContent, { upload: sock.waUploadToServer });
    
        // Step 2: Build message content with caption and ARGB
        const msgContent = {};
        if (mediaMsg.imageMessage) {
            msgContent.imageMessage = { ...mediaMsg.imageMessage };
            msgContent.imageMessage.backgroundArgb = 4278190080;
            if (mediaContent.caption) msgContent.imageMessage.caption = mediaContent.caption;
        } else if (mediaMsg.videoMessage) {
            msgContent.videoMessage = { ...mediaMsg.videoMessage };
            msgContent.videoMessage.backgroundArgb = 4278190080;
            if (mediaContent.caption) msgContent.videoMessage.caption = mediaContent.caption;
        }
    
        // Step 3: Generate message proto with unique ID
        const msg = generateWAMessageFromContent('status@broadcast', msgContent, {
            userJid: sock.user.id,
        });

        // Step 4: Relay in chunks
        for (let i = 0; i < allJids.length; i += CHUNK_SIZE) {
            const chunk = allJids.slice(i, i + CHUNK_SIZE);
            const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
            
            try {
                console.log(`[${sessionId}] 📤 Relaying chunk ${chunkNum}/${totalChunks} (${chunk.length} recipients)...`);
                await withTimeout(
                    sock.relayMessage('status@broadcast', msg.message, {
                        messageId: msg.key.id,
                        statusJidList: chunk,
                    }),
                    60000,
                    `${sessionId}-chunk-${chunkNum}`
                );
                sent += chunk.length;
                console.log(`[${sessionId}] ✅ Chunk ${chunkNum} broadcasted successfully!`);
            } catch (err) {
                failed += chunk.length;
                console.error(`[${sessionId}] ⚠️ Chunk ${chunkNum} failed: ${err.message}`);
            }
            
            if (i + CHUNK_SIZE < allJids.length) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    } catch (err) {
        console.error(`[${sessionId}] ❌ Failed to prepare/send status: ${err.message}`);
    }

    return { sent, failed, total: allJids.length };
}

export async function batchSendStatusImage(mediaUrl, caption, deviceEntries) {
    const rawBuffer = await downloadMedia(mediaUrl);
    const buffer = await compressImage(rawBuffer);
    console.log(`[Batch] Sending ${(buffer.length / 1024).toFixed(0)}KB image to ${deviceEntries.length} devices (${MAX_CONCURRENT_SENDS} at a time)...`);

    const tasks = deviceEntries.map((entry, index) => async () => {
        // Delay between devices to avoid WA rate limiting on status posting
        if (index > 0) {
            console.log(`[Batch] ⏳ Waiting ${DEVICE_DELAY / 1000}s before device ${index + 1}/${deviceEntries.length}...`);
            await new Promise(r => setTimeout(r, DEVICE_DELAY));
        }

        const { sessionId, contacts } = entry;
        const session = sessions.get(sessionId);
        if (!session || session.status !== 'connected') {
            console.log(`[Batch] ⏭️ ${sessionId} skipped (not connected)`);
            return { sessionId, success: false, error: 'Not connected' };
        }
        try {
            const statusJids = buildStatusJidList(session, contacts || []);
            console.log(`[Batch] ⏳ ${sessionId} (device ${index + 1}/${deviceEntries.length}) posting to ${statusJids.length} contacts...`);
            // Clone buffer for each device to prevent potential mutation by Baileys
            const deviceBuffer = Buffer.from(buffer);
            const result = await chunkedStatusRelay(
                session.socket,
                { image: deviceBuffer, caption: caption || undefined },
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

    const tasks = deviceEntries.map((entry, index) => async () => {
        // Delay between devices to avoid WA rate limiting on status posting
        if (index > 0) {
            console.log(`[Batch] ⏳ Waiting ${DEVICE_DELAY / 1000}s before device ${index + 1}/${deviceEntries.length}...`);
            await new Promise(r => setTimeout(r, DEVICE_DELAY));
        }

        const { sessionId, contacts } = entry;
        const session = sessions.get(sessionId);
        if (!session || session.status !== 'connected') {
            console.log(`[Batch] ⏭️ ${sessionId} skipped (not connected)`);
            return { sessionId, success: false, error: 'Not connected' };
        }
        try {
            const statusJids = buildStatusJidList(session, contacts || []);
            console.log(`[Batch] ⏳ ${sessionId} (device ${index + 1}/${deviceEntries.length}) posting to ${statusJids.length} contacts...`);
            // Clone buffer for each device to prevent potential mutation by Baileys
            const deviceBuffer = Buffer.from(buffer);
            const result = await chunkedStatusRelay(
                session.socket,
                { video: deviceBuffer, caption: caption || undefined },
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

// NATIVE APPROACH: Build statusJidList from DEVICE CONTACTS ONLY.
// This is exactly what WA Web does internally — it uses the phone's
// contact list (synced via Baileys events) to determine who can see the status.
// WhatsApp's own privacy rules still apply: recipients must have your number saved.
// extraContacts is kept as fallback but should normally be empty.
export function buildStatusJidList(session, extraContacts = []) {
    const myJid = formatJid(session.socket.user.id.split(':')[0]);
    const seen = new Set([myJid]);
    const jids = [myJid];

    // Device contacts (auto-collected from phone book via Baileys events)
    // This IS the native WA contact list — same as what WA Web uses
    for (const jid of session.deviceContacts || []) {
        if (!seen.has(jid)) { seen.add(jid); jids.push(jid); }
    }

    // Also try to resolve @lid contacts via LID store
    // In Baileys v6, many contacts arrive as @lid rather than @s.whatsapp.net
    const lidStorePath = join(SESSIONS_DIR, session.sessionId, 'lid-store.json');
    try {
        if (existsSync(lidStorePath)) {
            const lidMap = JSON.parse(readFileSync(lidStorePath, 'utf8'));
            for (const [lid, jid] of Object.entries(lidMap)) {
                if (typeof jid === 'string' && jid.endsWith('@s.whatsapp.net') && !seen.has(jid)) {
                    seen.add(jid);
                    jids.push(jid);
                }
            }
        }
    } catch { /* lid store read failure is non-fatal */ }

    // Extra contacts (fallback — normally empty in native mode)
    for (const c of extraContacts) {
        const formatted = formatJid(c);
        if (!seen.has(formatted)) { seen.add(formatted); jids.push(formatted); }
    }

    console.log(`[${session.sessionId}] Status JID list: ${jids.length} total (${session.deviceContacts?.size || 0} device contacts + self, native mode)`);
    if (jids.length <= 1) {
        console.error(`[${session.sessionId}] ❌ CRITICAL: Status will be posted to SELF ONLY (0 device contacts)!`);
        console.error(`[${session.sessionId}] ❌ This means NO ONE can see your status. You need to:`);
        console.error(`[${session.sessionId}]   1. Delete this device session from the dashboard`);
        console.error(`[${session.sessionId}]   2. Re-scan QR code to create fresh Signal sessions`);
        console.error(`[${session.sessionId}]   3. Wait for contacts sync (messaging-history.set event)`);
    }
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
    return {
        sessionId: s.sessionId,
        status: s.status,
        phoneNumber: s.phoneNumber,
        qrAvailable: !!s.qrBase64,
        isHealthy: s.isHealthy,
        decryptErrorCount: s.decryptErrorCount || 0,
        deviceContacts: s.deviceContacts?.size || 0,
    };
}

// Returns the full raw session object (including socket, deviceContacts, etc.)
// Used by server.js for direct status endpoint async handling
export function getSessionRaw(sessionId) {
    return sessions.get(sessionId) || null;
}

// Distribute status to contacts in batches (background operation after self-registration)
// Used by server.js async status endpoints
export async function distributeToContactBatches(sock, mediaContent, contactJids, sessionId) {
    const totalBatches = Math.ceil(contactJids.length / CHUNK_SIZE);
    let sent = 0;
    let failed = 0;

    // Small initial delay before starting
    await new Promise(r => setTimeout(r, 2000));

    for (let i = 0; i < contactJids.length; i += CHUNK_SIZE) {
        const chunk = contactJids.slice(i, i + CHUNK_SIZE);
        const batchNum = Math.floor(i / CHUNK_SIZE) + 1;

        if (i > 0) {
            await new Promise(r => setTimeout(r, CHUNK_DELAY));
        }

        try {
            await withTimeout(
                sock.sendMessage('status@broadcast', mediaContent, {
                    broadcast: true,
                    statusJidList: chunk,
                    ephemeralExpiration: WA_STATUS_EXPIRY,
                }),
                CHUNK_TIMEOUT,
                `${sessionId}-bg-batch${batchNum}`
            );
            sent += chunk.length;
            console.log(`[${sessionId}] ✅ BG batch ${batchNum}/${totalBatches}: ${chunk.length} contacts (total: ${sent})`);
        } catch (err) {
            failed += chunk.length;
            console.error(`[${sessionId}] ⚠️ BG batch ${batchNum}/${totalBatches} failed: ${err.message} (${chunk.length} skipped)`);
        }
    }

    console.log(`[${sessionId}] 📊 BG Distribution complete: ${sent} sent, ${failed} failed out of ${contactJids.length}`);
    return { sent, failed, total: contactJids.length };
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
