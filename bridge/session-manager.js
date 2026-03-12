/**
 * Baileys Session Manager — v6.x compatible
 * Fixed: reconnect does NOT delete credentials (was causing QR loop on 515 restartRequired)
 */

import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    generateWAMessageFromContent
} from '@whiskeysockets/baileys';
import { existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
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
    };
    sessions.set(sessionId, sessionData);

    let sock;
    try {
        sock = makeWASocket({
            version,
            auth: state,
            logger,
            printQRInTerminal: false,
            browser: ['Ubuntu', 'Chrome', '124.0.0'],
            generateHighQualityLinkPreview: false,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 2000,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            // Enable contact sync so we can collect device contacts for WA Status
            shouldSyncHistoryMessage: () => true,
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
            try {
                const qrBase64 = await QRCode.toDataURL(qr);
                sessionData.qr = qr;
                sessionData.qrBase64 = qrBase64;
                sessionData.status = 'qr';
                console.log(`[${sessionId}] QR ready — scan now`);
            } catch (e) {
                console.error(`[${sessionId}] QR generation error:`, e.message);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(`[${sessionId}] Closed. Code: ${statusCode}. Reconnect: ${shouldReconnect}`);

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
            sessionData.phoneNumber = user?.id ? user.id.split(':')[0] : null;
            console.log(`[${sessionId}] ✅ Connected! +${sessionData.phoneNumber}`);
            await sendWebhook(sessionId, 'session.connected', {
                sessionId,
                phoneNumber: sessionData.phoneNumber,
            });
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            if (msg.key.fromMe) continue;
            const from = msg.key.remoteJid;
            if (!from || from.endsWith('@g.us')) continue;
            // Skip @lid (Linked Device IDs) — these are internal WhatsApp messages, not real users
            if (from.endsWith('@lid')) continue;

            const body =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                msg.message?.videoMessage?.caption || '';

            // Clean phone number — strip both @s.whatsapp.net and @lid
            const phone = from
                .replace('@s.whatsapp.net', '')
                .replace('@lid', '')
                .trim();

            await sendWebhook(sessionId, 'message.received', {
                sessionId,
                payload: {
                    id: msg.key.id,
                    from: phone,
                    body,
                    type: getMessageType(msg),
                    timestamp: msg.messageTimestamp,
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
        }
        console.log(`[${sessionId}] contacts.upsert: ${sessionData.deviceContacts.size} total device contacts`);
    });

    sock.ev.on('contacts.update', (contactsList) => {
        for (const contact of contactsList) {
            if (contact.id && contact.id.endsWith('@s.whatsapp.net')) {
                sessionData.deviceContacts.add(contact.id);
            }
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

// Build the statusJidList from: sender's own JID + device contacts + extra contacts
function buildStatusJidList(session, extraContacts = []) {
    const myJid = formatJid(session.socket.user.id.split(':')[0]);
    const jids = new Set([myJid]);

    // Add all device contacts (auto-collected from phone book)
    for (const jid of session.deviceContacts || []) {
        jids.add(jid);
    }

    // Add any extra contacts passed from the app
    for (const c of extraContacts) {
        jids.add(formatJid(c));
    }

    console.log(`[${session.sessionId}] Status JID list: ${jids.size} contacts`);
    return [...jids];
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
