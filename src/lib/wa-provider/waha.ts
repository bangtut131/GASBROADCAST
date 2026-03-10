import type {
    WAProvider,
    SessionConfig,
    SessionStatus,
    SendResult,
    ParsedEvent,
    WAProviderType,
} from '@/types';

/* =====================================================
   WAHA (WhatsApp HTTP API) Adapter
   Self-hosted unofficial WhatsApp Web-based API
   Docs: https://waha.devlike.pro
   ===================================================== */

interface WAHAConfig {
    apiUrl?: string;
    apiKey?: string;
}

export class WAHAProvider implements WAProvider {
    readonly type: WAProviderType = 'waha';
    private apiUrl: string;
    private apiKey: string;

    constructor(config?: WAHAConfig) {
        this.apiUrl = config?.apiUrl || process.env.WAHA_API_URL || 'http://localhost:3000';
        this.apiKey = config?.apiKey || process.env.WAHA_API_KEY || '';
    }

    private async request(method: string, path: string, body?: unknown) {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.apiKey) {
            headers['X-Api-Key'] = this.apiKey;
        }

        const response = await fetch(`${this.apiUrl}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`WAHA API error ${response.status}: ${text}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            return response.json();
        }
        return response.text();
    }

    async createSession(config: SessionConfig): Promise<SessionStatus> {
        await this.request('POST', '/api/sessions', {
            name: config.name,
            config: {
                webhooks: config.webhookUrl ? [{ url: config.webhookUrl, events: ['message', 'session.status'] }] : [],
            },
        });

        await this.request('POST', `/api/sessions/${config.name}/start`, {});

        return {
            id: config.name,
            status: 'qr_pending',
        };
    }

    async getSession(sessionId: string): Promise<SessionStatus> {
        try {
            const data = await this.request('GET', `/api/sessions/${sessionId}`);
            const status = data.status === 'WORKING' ? 'connected' :
                data.status === 'SCAN_QR_CODE' ? 'qr_pending' : 'disconnected';
            return {
                id: sessionId,
                status,
                phoneNumber: data.me?.id?.replace('@c.us', '') || undefined,
                name: data.me?.pushName || undefined,
            };
        } catch {
            return { id: sessionId, status: 'disconnected' };
        }
    }

    async deleteSession(sessionId: string): Promise<void> {
        await this.request('DELETE', `/api/sessions/${sessionId}`);
    }

    async getQRCode(sessionId: string): Promise<string> {
        // Returns base64 QR code image
        const data = await this.request('GET', `/api/${sessionId}/auth/qr?format=image`);
        // WAHA can return raw image or base64 depending on config
        if (typeof data === 'string') return data;
        return data?.qr || '';
    }

    async sendText(sessionId: string, to: string, text: string, contacts?: string[]): Promise<SendResult> {
        try {
            const chatId = to.includes('@') ? to : `${to}@c.us`;
            const data = await this.request('POST', '/api/sendText', {
                session: sessionId,
                chatId,
                text,
                contacts,
            });
            return { success: true, messageId: data?.id };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async sendImage(sessionId: string, to: string, imageUrl: string, caption?: string, contacts?: string[]): Promise<SendResult> {
        try {
            const chatId = to.includes('@') ? to : `${to}@c.us`;
            const data = await this.request('POST', '/api/sendImage', {
                session: sessionId,
                chatId,
                file: { url: imageUrl },
                caption,
                contacts,
            });
            return { success: true, messageId: data?.id };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async sendDocument(sessionId: string, to: string, docUrl: string, filename: string): Promise<SendResult> {
        try {
            const chatId = to.includes('@') ? to : `${to}@c.us`;
            const data = await this.request('POST', '/api/sendFile', {
                session: sessionId,
                chatId,
                file: { url: docUrl },
                filename,
            });
            return { success: true, messageId: data?.id };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async sendVideo(sessionId: string, to: string, videoUrl: string, caption?: string): Promise<SendResult> {
        try {
            const chatId = to.includes('@') ? to : `${to}@c.us`;
            const data = await this.request('POST', '/api/sendVideo', {
                session: sessionId,
                chatId,
                file: { url: videoUrl },
                caption,
            });
            return { success: true, messageId: data?.id };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    // ==================== WA Status / Stories ====================
    // These use dedicated WAHA status endpoints instead of regular messaging

    async sendStatusText(sessionId: string, text: string, backgroundColor?: string, font?: number, contacts?: string[]): Promise<SendResult> {
        try {
            const data = await this.request('POST', `/api/${sessionId}/status/text`, {
                text,
                backgroundColor: backgroundColor || '#1D4ED8',
                font: font || 1,
                contacts: contacts?.map(c => c.includes('@') ? c : `${c}@c.us`),
            });
            return { success: true, messageId: data?.id };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async sendStatusImage(sessionId: string, imageUrl: string, caption?: string, contacts?: string[]): Promise<SendResult> {
        try {
            const data = await this.request('POST', `/api/${sessionId}/status/image`, {
                file: { url: imageUrl },
                caption,
                contacts: contacts?.map(c => c.includes('@') ? c : `${c}@c.us`),
            });
            return { success: true, messageId: data?.id };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async sendStatusVideo(sessionId: string, videoUrl: string, caption?: string, contacts?: string[]): Promise<SendResult> {
        try {
            const data = await this.request('POST', `/api/${sessionId}/status/video`, {
                file: { url: videoUrl },
                caption,
                contacts: contacts?.map(c => c.includes('@') ? c : `${c}@c.us`),
            });
            return { success: true, messageId: data?.id };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    handleWebhook(payload: any): ParsedEvent | null {
        if (!payload?.event) return null;

        if (payload.event === 'message') {
            return {
                type: 'message',
                sessionId: payload.session,
                data: {
                    messageId: payload.payload?.id,
                    from: payload.payload?.from?.replace('@c.us', ''),
                    body: payload.payload?.body,
                    messageType: payload.payload?.type,
                    timestamp: payload.payload?.timestamp,
                },
            };
        }

        if (payload.event === 'session.status') {
            return {
                type: 'connection',
                sessionId: payload.session,
                data: {
                    status: payload.payload?.status,
                },
            };
        }

        return null;
    }
}
