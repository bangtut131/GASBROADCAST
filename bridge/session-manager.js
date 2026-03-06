/**
 * Baileys Session Manager
 * Manages multiple WhatsApp Web sessions with QR code support
 * API-compatible with WAHA for seamless integration
 */

const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    jidNormalizedUser,
    downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const QRCode = require('qrcode');
const axios = require('axios');

const SESSIONS_DIR = process.env.SESSIONS_DIR || path.join(__dirname, 'sessions');
const WEBHOOK_URL = process.env.WEBHOOK_URL; // Main app webhook URL
const API_SECRET = process.env.API_SECRET || 'bridge-secret';
const logger = pino({ level: 'silent' }); // Suppress Baileys noisy logs

// In-memory session registry
const sessions = new Map(); // sessionId → { socket, qr, status, store }

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// ==================== Session Lifecycle ====================

async function createSession(sessionId) {
    if (sessions.has(sessionId)) {
        const existing = sessions.get(sessionId);
        if (existing.status === 'connected') return { status: 'already_connected' };
        // If it's in another state, clean up and restart
        await deleteSession(sessionId);
    }

    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const store = makeInMemoryStore({ logger });
    store.readFromFile(path.join(sessionDir, 'store.json'));

    const sessionData = {
        sessionId,
        status: 'starting',
        qr: null,
        qrBase64: null,
        phoneNumber: null,
        socket: null,
        store,
    };
    sessions.set(sessionId, sessionData);

    const sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: ['GasBroadcast', 'Chrome', '120.0.0'],
        generateHighQualityLinkPreview: true,
    });

    store.bind(sock.ev);
    sessionData.socket = sock;

    // ---- Events ----
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            // Generate QR as base64 image
            const qrBase64 = await QRCode.toDataURL(qr);
            sessionData.qr = qr;
            sessionData.qrBase64 = qrBase64;
            sessionData.status = 'qr';
            console.log(`[${sessionId}] QR code ready — waiting for scan`);
        }

        if (connection === 'close') {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`[${sessionId}] Connection closed. Reconnect: ${shouldReconnect}`);

            if (shouldReconnect) {
                sessionData.status = 'connecting';
                sessionData.qr = null;
                sessionData.qrBase64 = null;
                // Auto-reconnect after short delay
                setTimeout(() => createSession(sessionId), 3000);
            } else {
                // Logged out — clean up
                sessionData.status = 'disconnected';
                sessions.delete(sessionId);
                // Remove saved auth
                const dir = path.join(SESSIONS_DIR, sessionId);
                if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
            }
        }

        if (connection === 'open') {
            const user = sock.user;
            sessionData.status = 'connected';
            sessionData.qr = null;
            sessionData.qrBase64 = null;
            sessionData.phoneNumber = user?.id ? user.id.split(':')[0] : null;
            console.log(`[${sessionId}] ✅ Connected! Number: ${sessionData.phoneNumber}`);

            // Save store periodically
            setInterval(() => {
                store.writeToFile(path.join(SESSIONS_DIR, sessionId, 'store.json'));
            }, 10_000);

            // Notify main app
            await sendWebhook(sessionId, 'session.connected', {
                sessionId,
                phoneNumber: sessionData.phoneNumber,
            });
        }
    });

    // Forward incoming messages to main app webhook
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            if (msg.key.fromMe) continue; // Skip outgoing messages

            const from = msg.key.remoteJid;
            if (!from || from.endsWith('@g.us')) continue; // Skip groups for now

            const body =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                msg.message?.videoMessage?.caption ||
                '';

            const phone = from.replace('@s.whatsapp.net', '');

            await sendWebhook(sessionId, 'message.received', {
                sessionId,
                event: 'message',
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

    return { status: 'starting', sessionId };
}

async function deleteSession(sessionId) {
    const session = sessions.get(sessionId);
    if (session?.socket) {
        try { session.socket.end(undefined); } catch { }
    }
    sessions.delete(sessionId);
    const dir = path.join(SESSIONS_DIR, sessionId);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
}

// ==================== Message Sending ====================

async function sendText(sessionId, to, text) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') {
        return { success: false, error: 'Session not connected' };
    }
    try {
        const jid = formatJid(to);
        await session.socket.sendMessage(jid, { text });
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function sendImage(sessionId, to, imageUrl, caption = '') {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') {
        return { success: false, error: 'Session not connected' };
    }
    try {
        const jid = formatJid(to);
        await session.socket.sendMessage(jid, {
            image: { url: imageUrl },
            caption,
        });
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function sendVideo(sessionId, to, videoUrl, caption = '') {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') {
        return { success: false, error: 'Session not connected' };
    }
    try {
        const jid = formatJid(to);
        await session.socket.sendMessage(jid, {
            video: { url: videoUrl },
            caption,
        });
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ==================== Session Info ====================

function getSession(sessionId) {
    const s = sessions.get(sessionId);
    if (!s) return null;
    return {
        sessionId: s.sessionId,
        status: s.status,
        phoneNumber: s.phoneNumber,
        qrAvailable: !!s.qrBase64,
    };
}

function getAllSessions() {
    return Array.from(sessions.values()).map(s => ({
        sessionId: s.sessionId,
        status: s.status,
        phoneNumber: s.phoneNumber,
    }));
}

function getQR(sessionId) {
    const s = sessions.get(sessionId);
    return s?.qrBase64 || null;
}

// ==================== Restore Sessions on Startup ====================

async function restorePersistedSessions() {
    if (!fs.existsSync(SESSIONS_DIR)) return;
    const dirs = fs.readdirSync(SESSIONS_DIR);
    if (dirs.length === 0) return;
    console.log(`[Bridge] Restoring ${dirs.length} session(s)...`);
    for (const sessionId of dirs) {
        const sessionPath = path.join(SESSIONS_DIR, sessionId);
        if (fs.statSync(sessionPath).isDirectory()) {
            console.log(`[Bridge] Restoring session: ${sessionId}`);
            await createSession(sessionId).catch(e => console.error(`[Bridge] Restore error for ${sessionId}:`, e));
            // Stagger restores
            await new Promise(r => setTimeout(r, 500));
        }
    }
}

// ==================== Helpers ====================

function formatJid(phone) {
    // Handle status broadcast
    if (phone === 'status@broadcast') return 'status@broadcast';
    // Remove non-digits, ensure country code
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
    } catch { /* Webhook failure is non-fatal */ }
}

module.exports = {
    createSession,
    deleteSession,
    sendText,
    sendImage,
    sendVideo,
    getSession,
    getAllSessions,
    getQR,
    restorePersistedSessions,
};
