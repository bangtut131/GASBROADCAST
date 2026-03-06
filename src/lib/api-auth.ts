import { NextRequest } from 'next/server';
import { createHash } from 'crypto';

export interface ApiAuthResult {
    tenantId: string;
    permissions: string[];
    supabase: any;
}

export interface ApiAuthError {
    error: string;
    status: number;
}

// Verify API key from request headers & return tenant context
export async function verifyApiKey(request: NextRequest): Promise<ApiAuthResult | ApiAuthError> {
    const authHeader = request.headers.get('authorization');
    const apiKey = authHeader?.replace('Bearer ', '').trim() || request.headers.get('x-api-key') || '';

    if (!apiKey) {
        return { error: 'API key required. Use Authorization: Bearer <key> or X-Api-Key header', status: 401 };
    }

    const keyHash = createHash('sha256').update(apiKey).digest('hex');

    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = await createServiceClient();

    const { data: key } = await supabase
        .from('api_keys')
        .select('id, tenant_id, permissions, is_active')
        .eq('key_hash', keyHash)
        .eq('is_active', true)
        .single();

    if (!key) {
        return { error: 'Invalid or revoked API key', status: 401 };
    }

    // Track last_used_at async (don't await)
    supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id);

    return { tenantId: key.tenant_id, permissions: key.permissions as string[], supabase };
}

export function hasPermission(auth: ApiAuthResult, permission: string): boolean {
    return auth.permissions.includes(permission);
}
