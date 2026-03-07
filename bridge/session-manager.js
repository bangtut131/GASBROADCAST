/**
 * Baileys Session Manager — v6.x compatible (no makeInMemoryStore)
 */

import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
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

// Silent logger — suppress Baileys verbose output
const logger = pino({ level: 'silent' });

// In-memory session registry
const sessions = new Map();

// Ensure sessions directory exists
if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });

// ==================== Session Lifecycle ====================

export async function createSession(sessionId) {
    if (sessions.has(sessionId)) {
        const existing = sessions.get(sessionId);
        if (existing.status === 'connected') return { status: 'already_connected' };
        await deleteSession(sessionId);
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
    } catch {
        version = [2, 3000, 1015901307]; // Fallback version
    }

    const sessionData = {
        sessionId,
        status: 'starting',
        qr: null,
        qrBase64: null,
        phoneNumber: null,
        socket: null,
    };
    sessions.set(sessionId, sessionData);

    let sock;
    try {
        sock = makeWASocket({
            version,
            auth: state,
            logger,
            printQRInTerminal: false,
            browser: ['GasBroadcast', 'Chrome', '120.0.0'],
            generateHighQualityLinkPreview: false,
            connectTimeoutMs: 30000,
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
            const code = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = code !== DisconnectReason.loggedOut;
            console.log(`[${sessionId}] Closed. Code: ${code}. Reconnect: ${shouldReconnect}`);

            if (shouldReconnect) {
                sessionData.status = 'reconnecting';
                sessionData.qr = null;
                sessionData.qrBase64 = null;
                setTimeout(() => createSession(sessionId).catch(console.error), 5000);
            } else {
                sessionData.status = 'disconnected';
                sessions.delete(sessionId);
                const dir = join(SESSIONS_DIR, sessionId);
                if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
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

    // Forward inbound messages to main app
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            if (msg.key.fromMe) continue;
            const from = msg.key.remoteJid;
            if (!from || from.endsWith('@g.us')) continue;

            const body =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                msg.message?.videoMessage?.caption || '';

            await sendWebhook(sessionId, 'message.received', {
                sessionId,
                payload: {
                    id: msg.key.id,
                    from: from.replace('@s.whatsapp.net', ''),
                    body,
                    type: getMessageType(msg),
                    timestamp: msg.messageTimestamp,
                },
            });
        }
    });

    return { status: 'starting', sessionId };
}

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

export async function sendText(sessionId, to, text) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') return { success: false, error: 'Not connected' };
    try {
        await session.socket.sendMessage(formatJid(to), { text });
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
}

export async function sendImage(sessionId, to, imageUrl, caption = '') {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') return { success: false, error: 'Not connected' };
    try {
        await session.socket.sendMessage(formatJid(to), { image: { url: imageUrl }, caption });
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
}

export async function sendVideo(sessionId, to, videoUrl, caption = '') {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') return { success: false, error: 'Not connected' };
    try {
        await session.socket.sendMessage(formatJid(to), { video: { url: videoUrl }, caption });
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
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
    const dirs = readdirSync(SESSIONS_DIR).filter(d => {
        try { return statSync(join(SESSIONS_DIR, d)).isDirectory(); } catch { return false; }
    });
    if (dirs.length === 0) return;
    console.log(`[Bridge] Restoring ${dirs.length} session(s)...`);
    for (const sessionId of dirs) {
        try {
            await createSession(sessionId);
            await new Promise(r => setTimeout(r, 1500));
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
