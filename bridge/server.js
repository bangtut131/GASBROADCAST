// ===== Global error guards =====
process.on('uncaughtException', (err) => {
    console.error('[Bridge] Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Bridge] Unhandled rejection:', reason?.message || reason);
});

import express from 'express';
import cors from 'cors';
import {
    createSession, deleteSession,
    sendText, sendImage, sendVideo,
    getSession, getAllSessions, getQR,
    restorePersistedSessions,
} from './session-manager.js';

const app = express();
const PORT = process.env.PORT || 3002;
const API_SECRET = process.env.API_SECRET || 'bridge-secret';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ==================== Auth ====================
function auth(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (key !== API_SECRET) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

// ==================== Health (no auth — Railway uses this) ====================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'gasbroadcast-bridge',
        sessions: getAllSessions().length,
        timestamp: new Date().toISOString(),
    });
});

// ==================== Sessions ====================
app.get('/api/sessions', auth, (req, res) => {
    res.json({ success: true, data: getAllSessions() });
});

app.post('/api/sessions/start', auth, async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
        const result = await createSession(sessionId);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== Per-session ====================
app.get('/api/:session/auth/qr', auth, (req, res) => {
    const { session } = req.params;
    const info = getSession(session);
    if (!info) return res.status(404).json({ error: 'Session not found. POST /api/sessions/start first.' });
    if (info.status === 'connected') return res.json({ success: true, status: 'connected', qr: null });
    const qrBase64 = getQR(session);
    if (!qrBase64) return res.json({ success: true, status: info.status, qr: null, message: 'QR not ready, retry in 2s' });
    res.json({ success: true, status: 'qr', qr: qrBase64 });
});

app.get('/api/:session/status', auth, (req, res) => {
    const info = getSession(req.params.session);
    if (!info) return res.status(404).json({ error: 'Session not found' });
    res.json({ success: true, data: info });
});

app.post('/api/:session/sendText', auth, async (req, res) => {
    const { to, text, body } = req.body;
    const msg = text || body;
    if (!to || !msg) return res.status(400).json({ error: 'to and text required' });
    const result = await sendText(req.params.session, to, msg);
    result.success ? res.json({ success: true }) : res.status(500).json({ error: result.error });
});

app.post('/api/:session/sendImage', auth, async (req, res) => {
    const { to, imageUrl, url, caption } = req.body;
    const mediaUrl = imageUrl || url;
    if (!to || !mediaUrl) return res.status(400).json({ error: 'to and imageUrl required' });
    const result = await sendImage(req.params.session, to, mediaUrl, caption || '');
    result.success ? res.json({ success: true }) : res.status(500).json({ error: result.error });
});

app.post('/api/:session/sendVideo', auth, async (req, res) => {
    const { to, videoUrl, url, caption } = req.body;
    const mediaUrl = videoUrl || url;
    if (!to || !mediaUrl) return res.status(400).json({ error: 'to and videoUrl required' });
    const result = await sendVideo(req.params.session, to, mediaUrl, caption || '');
    result.success ? res.json({ success: true }) : res.status(500).json({ error: result.error });
});

app.post('/api/:session/logout', auth, async (req, res) => {
    await deleteSession(req.params.session);
    res.json({ success: true });
});

// ==================== Start ====================
app.listen(PORT, async () => {
    console.log(`\n  GasBroadcast Baileys Bridge 🔗`);
    console.log(`  Port   : ${PORT}`);
    console.log(`  Secret : ${API_SECRET.substring(0, 6)}...`);
    console.log(`  Hook   : ${process.env.WEBHOOK_URL || '(not set)'}\n`);

    try {
        await restorePersistedSessions();
    } catch (err) {
        console.error('[Bridge] Session restore error (non-fatal):', err.message);
    }
});
