-- ============================================
-- WEB BROADCAST — Database Schema
-- Migration 001: Initial Tables
-- ============================================

-- Tenants / Organizations
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'agent', 'member')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WhatsApp Devices
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  phone_number TEXT,
  provider TEXT NOT NULL CHECK (provider IN ('waha', 'official')),
  provider_config JSONB DEFAULT '{}',
  session_id TEXT,
  status TEXT DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'qr_pending')),
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Contacts
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  phone TEXT NOT NULL,
  name TEXT,
  email TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  is_valid BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, phone)
);

-- Contact Groups
CREATE TABLE IF NOT EXISTS public.contact_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Contact Group Members (many-to-many)
CREATE TABLE IF NOT EXISTS public.contact_group_members (
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.contact_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, group_id)
);

-- Broadcast Campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT CHECK (media_type IN ('image', 'video', 'document')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'failed')),
  scheduled_at TIMESTAMPTZ,
  target_type TEXT CHECK (target_type IN ('group', 'manual')),
  target_group_id UUID REFERENCES public.contact_groups(id) ON DELETE SET NULL,
  target_phones TEXT[],
  total_recipients INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  min_delay INT DEFAULT 3,
  max_delay INT DEFAULT 8,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Broadcast Messages (individual sends within a campaign)
CREATE TABLE IF NOT EXISTS public.broadcast_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message_content TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);

-- Chat Messages (inbox)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'document', 'audio')),
  content TEXT,
  media_url TEXT,
  wa_message_id TEXT,
  status TEXT DEFAULT 'sent',
  is_from_bot BOOLEAN DEFAULT false,
  assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AutoReply Rules
CREATE TABLE IF NOT EXISTS public.autoreply_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  trigger_type TEXT DEFAULT 'keyword' CHECK (trigger_type IN ('keyword', 'contains', 'regex', 'ai')),
  trigger_value TEXT,
  response_text TEXT NOT NULL,
  response_media_url TEXT,
  is_active BOOLEAN DEFAULT true,
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- API Keys (for public REST API)
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  permissions TEXT[] DEFAULT '{send_message,read_contacts}',
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Webhooks
CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] DEFAULT '{message.received}',
  secret TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- === Indexes ===
CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_tenant ON public.devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON public.contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_contact_groups_tenant ON public.contact_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON public.campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_campaign ON public.broadcast_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_status ON public.broadcast_messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON public.messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_phone ON public.messages(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_messages_device ON public.messages(device_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autoreply_tenant ON public.autoreply_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON public.api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON public.api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON public.webhooks(tenant_id);
