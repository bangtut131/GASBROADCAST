/* ============================================
   WEB BROADCAST — TypeScript Type Definitions
   ============================================ */

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'starter' | 'pro' | 'enterprise';
  settings: Record<string, unknown>;
  created_at: string;
}

export interface Profile {
  id: string;
  tenant_id: string;
  full_name: string | null;
  role: 'owner' | 'admin' | 'agent' | 'member';
  avatar_url: string | null;
  created_at: string;
}

export type WAProviderType = 'waha' | 'official';
export type DeviceStatus = 'connected' | 'disconnected' | 'qr_pending' | 'unhealthy';

export interface Device {
  id: string;
  tenant_id: string;
  name: string;
  phone_number: string | null;
  provider: WAProviderType;
  provider_config: Record<string, unknown>;
  session_id: string | null;
  status: DeviceStatus;
  last_active_at: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  tenant_id: string;
  phone: string;
  name: string | null;
  email: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  is_valid: boolean;
  created_at: string;
}

export interface ContactGroup {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string;
  member_count?: number;
}

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed';

export interface Campaign {
  id: string;
  tenant_id: string;
  device_id: string | null;
  name: string;
  message_template: string;
  media_url: string | null;
  media_type: 'image' | 'video' | 'document' | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  target_type: 'group' | 'manual';
  target_group_id: string | null;
  target_phones: string[] | null;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  min_delay: number;
  max_delay: number;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  device?: Device;
}

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface BroadcastMessage {
  id: string;
  campaign_id: string;
  contact_id: string | null;
  phone: string;
  message_content: string | null;
  status: MessageStatus;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  contact?: Contact;
}

export type MessageDirection = 'inbound' | 'outbound';
export type MessageType = 'text' | 'image' | 'video' | 'document' | 'audio';

export interface Message {
  id: string;
  tenant_id: string;
  device_id: string | null;
  contact_id: string | null;
  phone: string;
  direction: MessageDirection;
  message_type: MessageType;
  content: string | null;
  media_url: string | null;
  wa_message_id: string | null;
  status: string;
  is_from_bot: boolean;
  assigned_agent_id: string | null;
  created_at: string;
  contact?: Contact;
}

export type AutoReplyTriggerType = 'keyword' | 'contains' | 'regex' | 'ai';

export interface AutoReplyRule {
  id: string;
  tenant_id: string;
  device_id: string | null;
  name: string;
  trigger_type: AutoReplyTriggerType;
  trigger_value: string | null;
  response_text: string;
  response_media_url: string | null;
  is_active: boolean;
  priority: number;
  // Advanced filters
  target_tags: string[];
  target_group_ids: string[];
  exclude_tags: string[];
  exclude_phones: string[];
  created_at: string;
}

export interface ApiKey {
  id: string;
  tenant_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  permissions: string[];
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export interface Webhook {
  id: string;
  tenant_id: string;
  url: string;
  events: string[];
  secret: string | null;
  is_active: boolean;
  created_at: string;
}

// === WA Provider Interfaces ===

export interface WAProvider {
  readonly type: WAProviderType;
  createSession(config: SessionConfig): Promise<SessionStatus>;
  getSession(sessionId: string): Promise<SessionStatus>;
  deleteSession(sessionId: string): Promise<void>;
  getQRCode(sessionId: string): Promise<string>;
  sendText(sessionId: string, to: string, text: string): Promise<SendResult>;
  sendImage(sessionId: string, to: string, imageUrl: string, caption?: string): Promise<SendResult>;
  sendDocument(sessionId: string, to: string, docUrl: string, filename: string): Promise<SendResult>;
  sendVideo(sessionId: string, to: string, videoUrl: string, caption?: string): Promise<SendResult>;
  handleWebhook(payload: unknown): ParsedEvent | null;
}

export interface SessionConfig {
  provider: WAProviderType;
  name: string;
  webhookUrl?: string;
  provider_config?: Record<string, unknown>;
  // WAHA-specific
  wahaApiUrl?: string;
  wahaApiKey?: string;
  // Official-specific
  accessToken?: string;
  phoneNumberId?: string;
  wabaId?: string;
}

export interface SessionStatus {
  id: string;
  status: DeviceStatus;
  phoneNumber?: string;
  name?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ParsedEvent {
  type: 'message' | 'status' | 'connection';
  sessionId: string;
  data: Record<string, unknown>;
}

// === Dashboard Stats ===

export interface DashboardStats {
  totalContacts: number;
  totalDevices: number;
  activeDevices: number;
  totalCampaigns: number;
  messagesSentToday: number;
  messagesReceivedToday: number;
  successRate: number;
}

// === API Response Wrapper ===

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// === Pagination ===

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
