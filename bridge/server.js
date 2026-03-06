/**
 * GasBroadcast Baileys Bridge
 * Express REST API — WAHA-compatible endpoints
 */

// ===== Global error guards (prevent Railway crash on unhandled errors) =====
process.on('uncaughtException', (err) => {
    console.error('[Bridge] Uncaught exception (non-fatal):', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Bridge] Unhandled rejection (non-fatal):', reason);
});

const express = require('express');
const cors = require('cors');

const {
    createSession,
    deleteSession,
    sendText,
    sendImage,
    sendVideo,
    getSession,
    getAllSessions,
    getQR,
    restorePersistedSessions,
} = require('./session-manager');

const app = express();
const PORT = process.env.PORT || 3002;
const API_SECRET = process.env.API_SECRET || 'bridge-secret';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ==================== Auth middleware ====================
function authMiddleware(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (key !== API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized — invalid API key' });
    }
    next();
}

// ==================== Health ====================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'gasbroadcast-bridge',
        sessions: getAllSessions().length,
        timestamp: new Date().toISOString(),
    });
});

// ==================== Sessions ====================

// List all sessions
app.get('/api/sessions', authMiddleware, (req, res) => {
    res.json({ success: true, data: getAllSessions() });
});

// Start a new session (or reconnect existing)
app.post('/api/sessions/start', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
        const result = await createSession(sessionId);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== Per-session routes ====================

// Get QR code (base64 image)
// WAHA-compatible: GET /api/{session}/auth/qr
app.get('/api/:session/auth/qr', authMiddleware, (req, res) => {
    const { session } = req.params;
    const sessionInfo = getSession(session);

    if (!sessionInfo) {
        return res.status(404).json({ error: 'Session not found. Start it first.' });
    }

    if (sessionInfo.status === 'connected') {
        return res.json({ success: true, status: 'connected', qr: null });
    }

    const qrBase64 = getQR(session);
    if (!qrBase64) {
        // QR not ready yet — tell client to poll
        return res.json({ success: true, status: sessionInfo.status, qr: null, message: 'QR not ready yet, retry in 2s' });
    }

    res.json({ success: true, status: 'qr', qr: qrBase64 });
});

// Get session status
app.get('/api/:session/status', authMiddleware, (req, res) => {
    const { session } = req.params;
    const sessionInfo = getSession(session);
    if (!sessionInfo) return res.status(404).json({ error: 'Session not found' });
    res.json({ success: true, data: sessionInfo });
});

// Send text message
app.post('/api/:session/sendText', authMiddleware, async (req, res) => {
    const { session } = req.params;
    const { to, text, body } = req.body;
    const message = text || body;
    if (!to || !message) return res.status(400).json({ error: 'to and text are required' });

    const result = await sendText(session, to, message);
    if (!result.success) return res.status(500).json({ error: result.error });
    res.json({ success: true });
});

// Send image
app.post('/api/:session/sendImage', authMiddleware, async (req, res) => {
    const { session } = req.params;
    const { to, imageUrl, url, caption } = req.body;
    const mediaUrl = imageUrl || url;
    if (!to || !mediaUrl) return res.status(400).json({ error: 'to and imageUrl are required' });

    const result = await sendImage(session, to, mediaUrl, caption || '');
    if (!result.success) return res.status(500).json({ error: result.error });
    res.json({ success: true });
});

// Send video
app.post('/api/:session/sendVideo', authMiddleware, async (req, res) => {
    const { session } = req.params;
    const { to, videoUrl, url, caption } = req.body;
    const mediaUrl = videoUrl || url;
    if (!to || !mediaUrl) return res.status(400).json({ error: 'to and videoUrl are required' });

    const result = await sendVideo(session, to, mediaUrl, caption || '');
    if (!result.success) return res.status(500).json({ error: result.error });
    res.json({ success: true });
});

// Logout & delete session
app.post('/api/:session/logout', authMiddleware, async (req, res) => {
    const { session } = req.params;
    await deleteSession(session);
    res.json({ success: true, message: 'Session deleted' });
});

// ==================== Webhook receiver (from Baileys to main app) ====================
// The bridge also receives internal callbacks here if needed

// ==================== Start ====================
app.listen(PORT, async () => {
    console.log('');
    console.log('  ╔═══════════════════════════════════════╗');
    console.log('  ║   GasBroadcast — Baileys Bridge 🔗   ║');
    console.log(`  ║   Port: ${PORT.toString().padEnd(31)}║`);
    console.log('  ╚═══════════════════════════════════════╝');
    console.log('');
    console.log(`  API Secret : ${API_SECRET.substring(0, 6)}...`);
    console.log(`  Webhook    : ${process.env.WEBHOOK_URL || '(not set)'}`);
    console.log('');

    // Restore any previously connected sessions on startup
    await restorePersistedSessions();
});
