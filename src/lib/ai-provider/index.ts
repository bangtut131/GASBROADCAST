/* =====================================================
   AI Provider Abstraction Layer
   Supports any OpenAI-compatible API:
   - SumoPod (sumopod.com)
   - OpenRouter (openrouter.ai)
   - OpenAI (api.openai.com)
   - Groq, Together AI, Ollama, etc.
   ===================================================== */

export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface AIConfig {
    baseUrl: string;          // e.g. https://api.sumopod.com/v1
    apiKey: string;
    model: string;            // e.g. gpt-4o, claude-3-5-sonnet, gemini-pro
    systemPrompt?: string;
    temperature?: number;     // 0.0 - 2.0
    maxTokens?: number;
    topP?: number;
}

export interface AIResponse {
    content: string;
    model: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

// Known popular AI aggregators / providers with their base URLs
export const AI_PROVIDERS: Record<string, { label: string; baseUrl: string; models: string[] }> = {
    sumopod: {
        label: 'SumoPod',
        baseUrl: 'https://api.sumopod.com/v1',
        models: ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'gemini-1.5-pro', 'llama-3.1-70b'],
    },
    openrouter: {
        label: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        models: [
            'openai/gpt-4o',
            'openai/gpt-4o-mini',
            'anthropic/claude-3.5-sonnet',
            'google/gemini-flash-1.5',
            'meta-llama/llama-3.1-70b-instruct',
            'mistralai/mistral-7b-instruct',
        ],
    },
    openai: {
        label: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    },
    groq: {
        label: 'Groq (Ultra Fast)',
        baseUrl: 'https://api.groq.com/openai/v1',
        models: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    },
    together: {
        label: 'Together AI',
        baseUrl: 'https://api.together.xyz/v1',
        models: ['meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    },
    custom: {
        label: 'Custom Endpoint',
        baseUrl: '',
        models: [],
    },
};

export class AIProvider {
    private config: AIConfig;

    constructor(config: AIConfig) {
        this.config = config;
    }

    async chat(messages: AIMessage[], overrides?: Partial<AIConfig>): Promise<AIResponse> {
        const cfg = { ...this.config, ...overrides };

        const body: Record<string, unknown> = {
            model: cfg.model,
            messages: cfg.systemPrompt
                ? [{ role: 'system', content: cfg.systemPrompt }, ...messages]
                : messages,
            temperature: cfg.temperature ?? 0.7,
            max_tokens: cfg.maxTokens ?? 512,
        };

        if (cfg.topP !== undefined) body.top_p = cfg.topP;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cfg.apiKey}`,
        };

        // OpenRouter specific headers
        if (cfg.baseUrl.includes('openrouter')) {
            headers['HTTP-Referer'] = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
            headers['X-Title'] = process.env.NEXT_PUBLIC_APP_NAME || 'GAS Smart Broadcast';
        }

        const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`AI API error ${response.status}: ${err}`);
        }

        const data = await response.json();
        return {
            content: data.choices?.[0]?.message?.content || '',
            model: data.model || cfg.model,
            usage: data.usage,
        };
    }

    // Single-turn reply (most common for auto-reply)
    async reply(userMessage: string, systemPrompt?: string): Promise<string> {
        const res = await this.chat(
            [{ role: 'user', content: userMessage }],
            systemPrompt ? { systemPrompt } : undefined
        );
        return res.content;
    }

    // Multi-turn conversation
    async conversate(history: AIMessage[], newUserMessage: string): Promise<AIResponse> {
        return this.chat([...history, { role: 'user', content: newUserMessage }]);
    }
}

// Factory from stored rule config
export function createAIProvider(config: {
    ai_base_url: string;
    ai_api_key: string;
    ai_model: string;
    ai_system_prompt?: string;
    ai_temperature?: number;
    ai_max_tokens?: number;
}): AIProvider {
    return new AIProvider({
        baseUrl: config.ai_base_url,
        apiKey: config.ai_api_key,
        model: config.ai_model,
        systemPrompt: config.ai_system_prompt,
        temperature: config.ai_temperature ?? 0.7,
        maxTokens: config.ai_max_tokens ?? 512,
    });
}
