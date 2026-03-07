import type {
    SessionConfig,
    SessionStatus,
    SendResult,
    ParsedEvent,
    WAProviderType,
} from '@/types';

/* =====================================================
   WhatsApp Provider Abstraction Interface
   Supports: WAHA (unofficial) + Meta Cloud API (official)
   ===================================================== */

export interface WAProvider {
    readonly type: WAProviderType;

    // Session Management
    createSession(config: SessionConfig): Promise<SessionStatus>;
    getSession(sessionId: string): Promise<SessionStatus>;
    deleteSession(sessionId: string): Promise<void>;
    getQRCode(sessionId: string): Promise<string>; // returns base64 QR image or pairing code

    // Messaging
    sendText(sessionId: string, to: string, text: string, contacts?: string[]): Promise<SendResult>;
    sendImage(sessionId: string, to: string, imageUrl: string, caption?: string, contacts?: string[]): Promise<SendResult>;
    sendDocument(sessionId: string, to: string, docUrl: string, filename: string): Promise<SendResult>;
    sendVideo(sessionId: string, to: string, videoUrl: string, caption?: string, contacts?: string[]): Promise<SendResult>;

    // Webhooks
    handleWebhook(payload: unknown): ParsedEvent | null;
}

/* =====================================================
   Provider Factory
   ===================================================== */

export function getProvider(type: WAProviderType, config?: Record<string, string>): WAProvider {
    if (type === 'waha') {
        const { WAHAProvider } = require('./waha');
        return new WAHAProvider(config);
    } else if (type === 'official') {
        const { OfficialProvider } = require('./official');
        return new OfficialProvider(config);
    } else if (type === 'wa-web') {
        // Baileys Bridge uses WAHA-compatible API — reuse WAHAProvider
        // config.apiUrl points to the bridge service URL
        const { WAHAProvider } = require('./waha');
        return new WAHAProvider(config);
    }
    throw new Error(`Unknown WA provider: ${type}`);
}


/* =====================================================
   Helper: Format phone number to WhatsApp format
   ===================================================== */

export function formatPhone(phone: string): string {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');

    // Handle Indonesian prefix: 08xx -> 628xx
    if (cleaned.startsWith('08')) {
        cleaned = '62' + cleaned.slice(1);
    }

    // Handle + prefix: +628xx -> 628xx
    if (cleaned.startsWith('0')) {
        cleaned = '62' + cleaned.slice(1);
    }

    return cleaned;
}

/* =====================================================
   Helper: Personalize message template
   Variables: {name}, {phone}, {email}, plus any custom
   ===================================================== */

export function personalizeMessage(
    template: string,
    variables: Record<string, string>
): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'gi'), value);
    }
    return result;
}
