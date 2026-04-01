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
    sendStatusText, sendStatusImage, sendStatusVideo,
    getSession, getAllSessions, getQR,
    restorePersistedSessions,
} from './session-manager.js';

const app = express();
const PORT = process.env.PORT || 3002;
const API_SECRET = process.env.API_SECRET || 'bridge-secret';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Increase server timeout for status posting (media download + upload can be slow)
app.use((req, res, next) => {
    res.setTimeout(90000); // 90s timeout
    next();
});

// ==================== Health Check (no auth) ====================
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

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

// WAHA-compatible: POST /api/sessions { name, config }
app.post('/api/sessions', auth, async (req, res) => {
    try {
        const { name, sessionId } = req.body;
        const id = name || sessionId;
        if (!id) return res.status(400).json({ error: 'name or sessionId required' });
        // Just register — actual start done via /api/sessions/:name/start
        res.json({ success: true, data: { id, status: 'starting' } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Original static endpoint — must be registered BEFORE /:name/start
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

// WAHA-compatible: POST /api/sessions/:name/start (after static route above)
app.post('/api/sessions/:name/start', auth, async (req, res) => {
    try {
        const sessionId = req.params.name;
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

// ==================== WAHA-compatible flat endpoints ====================
// These match the WAHAProvider request format: { session, chatId, text/file, caption }
// Required for wa-status posting and regular messaging

app.post('/api/sendText', auth, async (req, res) => {
    const { session, chatId, text, body: bodyText, contacts } = req.body;
    const msg = text || bodyText;
    if (!session || !chatId || !msg) return res.status(400).json({ error: 'session, chatId and text required' });
    const result = await sendText(session, chatId, msg, contacts || []);
    result.success ? res.json({ success: true }) : res.status(500).json({ error: result.error });
});

app.post('/api/sendImage', auth, async (req, res) => {
    const { session, chatId, to, file, imageUrl, caption, contacts } = req.body;
    const mediaUrl = file?.url || imageUrl;
    const recipient = chatId || to;
    if (!session || !recipient || !mediaUrl) return res.status(400).json({ error: 'session, chatId and file.url required' });
    const result = await sendImage(session, recipient, mediaUrl, caption || '', contacts || []);
    result.success ? res.json({ success: true }) : res.status(500).json({ error: result.error });
});

app.post('/api/sendVideo', auth, async (req, res) => {
    const { session, chatId, to, file, videoUrl, caption, contacts } = req.body;
    const mediaUrl = file?.url || videoUrl;
    const recipient = chatId || to;
    if (!session || !recipient || !mediaUrl) return res.status(400).json({ error: 'session, chatId and file.url required' });
    const result = await sendVideo(session, recipient, mediaUrl, caption || '', contacts || []);
    result.success ? res.json({ success: true }) : res.status(500).json({ error: result.error });
});

// ==================== WAHA-compatible Status (Story) endpoints ====================
// These match the WAHA API format for posting WhatsApp Status/Stories
// POST /api/{session}/status/text
// POST /api/{session}/status/image
// POST /api/{session}/status/video

app.post('/api/:session/status/text', auth, async (req, res) => {
    const { text, backgroundColor, font, contacts } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    const result = await sendStatusText(req.params.session, text, backgroundColor || '#1D4ED8', font || 1, contacts || []);
    result.success ? res.json({ success: true }) : res.status(500).json({ error: result.error });
});

app.post('/api/:session/status/image', auth, async (req, res) => {
    const { file, caption, contacts } = req.body;
    const mediaUrl = file?.url;
    if (!mediaUrl) return res.status(400).json({ error: 'file.url required' });
    const result = await sendStatusImage(req.params.session, mediaUrl, caption || '', contacts || []);
    result.success ? res.json({ success: true }) : res.status(500).json({ error: result.error });
});

app.post('/api/:session/status/video', auth, async (req, res) => {
    const { file, caption, contacts } = req.body;
    const mediaUrl = file?.url;
    if (!mediaUrl) return res.status(400).json({ error: 'file.url required' });
    const result = await sendStatusVideo(req.params.session, mediaUrl, caption || '', contacts || []);
    result.success ? res.json({ success: true }) : res.status(500).json({ error: result.error });
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
