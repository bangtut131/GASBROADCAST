import type {
    WAProvider,
    SessionConfig,
    SessionStatus,
    SendResult,
    ParsedEvent,
    WAProviderType,
} from '@/types';

/* =====================================================
   WhatsApp Business Cloud API (Official) Adapter
   Meta's official WhatsApp Business Platform
   Docs: https://developers.facebook.com/docs/whatsapp
   ===================================================== */

interface OfficialConfig {
    accessToken?: string;
    phoneNumberId?: string;
    apiUrl?: string;
}

export class OfficialProvider implements WAProvider {
    readonly type: WAProviderType = 'official';
    private accessToken: string;
    private phoneNumberId: string;
    private apiUrl: string;

    constructor(config?: OfficialConfig) {
        this.accessToken = config?.accessToken || process.env.META_WA_ACCESS_TOKEN || '';
        this.phoneNumberId = config?.phoneNumberId || process.env.META_WA_PHONE_NUMBER_ID || '';
        this.apiUrl = config?.apiUrl || process.env.META_WA_API_URL || 'https://graph.facebook.com/v21.0';
    }

    private async request(method: string, path: string, body?: unknown, customToken?: string) {
        const token = customToken || this.accessToken;
        const response = await fetch(`${this.apiUrl}${path}`, {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Meta API error ${response.status}: ${text}`);
        }

        return response.json();
    }

    // Official API uses phone_number_id directly, no separate session concept
    async createSession(config: SessionConfig): Promise<SessionStatus> {
        const phoneNumberId = (config.provider_config as any)?.phoneNumberId || this.phoneNumberId;
        return {
            id: phoneNumberId,
            status: 'connected', // Official API is always "connected" via token
        };
    }

    async getSession(sessionId: string): Promise<SessionStatus> {
        try {
            const data = await this.request('GET', `/${sessionId}`);
            return {
                id: sessionId,
                status: 'connected',
                phoneNumber: data.display_phone_number,
                name: data.verified_name,
            };
        } catch {
            return { id: sessionId, status: 'disconnected' };
        }
    }

    async deleteSession(sessionId: string): Promise<void> {
        // Official API doesn't have a "logout" — credentials are managed in Meta Business
        return;
    }

    async getQRCode(sessionId: string): Promise<string> {
        // Official API does not use QR codes
        return '';
    }

    async sendText(sessionId: string, to: string, text: string, contacts?: string[]): Promise<SendResult> {
        try {
            const phoneNumberId = sessionId;
            const data = await this.request('POST', `/${phoneNumberId}/messages`, {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'text',
                text: { body: text, preview_url: false },
            });
            return { success: true, messageId: data?.messages?.[0]?.id };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async sendImage(sessionId: string, to: string, imageUrl: string, caption?: string, contacts?: string[]): Promise<SendResult> {
        try {
            const data = await this.request('POST', `/${sessionId}/messages`, {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'image',
                image: { link: imageUrl, caption },
            });
            return { success: true, messageId: data?.messages?.[0]?.id };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async sendDocument(sessionId: string, to: string, docUrl: string, filename: string): Promise<SendResult> {
        try {
            const data = await this.request('POST', `/${sessionId}/messages`, {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'document',
                document: { link: docUrl, filename },
            });
            return { success: true, messageId: data?.messages?.[0]?.id };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async sendVideo(sessionId: string, to: string, videoUrl: string, caption?: string, contacts?: string[]): Promise<SendResult> {
        try {
            const data = await this.request('POST', `/${sessionId}/messages`, {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'video',
                video: { link: videoUrl, caption },
            });
            return { success: true, messageId: data?.messages?.[0]?.id };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    handleWebhook(payload: any): ParsedEvent | null {
        // Meta Cloud API webhook format
        const entry = payload?.entry?.[0];
        const change = entry?.changes?.[0];
        if (!change) return null;

        const msg = change?.value?.messages?.[0];
        const statuses = change?.value?.statuses?.[0];
        const phoneNumberId = change?.value?.metadata?.phone_number_id;

        if (msg) {
            return {
                type: 'message',
                sessionId: phoneNumberId,
                data: {
                    messageId: msg.id,
                    from: msg.from,
                    body: msg.text?.body || msg.caption || '',
                    messageType: msg.type,
                    timestamp: msg.timestamp,
                },
            };
        }

        if (statuses) {
            return {
                type: 'status',
                sessionId: phoneNumberId,
                data: {
                    messageId: statuses.id,
                    recipientId: statuses.recipient_id,
                    status: statuses.status, // sent, delivered, read
                    timestamp: statuses.timestamp,
                },
            };
        }

        return null;
    }
}
