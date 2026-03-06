-- Migration 003: AI Auto-Reply fields
-- Run this in Supabase SQL Editor

-- Add AI fields to autoreply_rules table
ALTER TABLE public.autoreply_rules
  ADD COLUMN IF NOT EXISTS ai_base_url TEXT,
  ADD COLUMN IF NOT EXISTS ai_api_key TEXT,
  ADD COLUMN IF NOT EXISTS ai_model TEXT,
  ADD COLUMN IF NOT EXISTS ai_system_prompt TEXT,
  ADD COLUMN IF NOT EXISTS ai_temperature NUMERIC DEFAULT 0.7,
  ADD COLUMN IF NOT EXISTS ai_max_tokens INTEGER DEFAULT 512,
  ADD COLUMN IF NOT EXISTS ai_context_turns INTEGER DEFAULT 5;

-- Add conversation history table for AI multi-turn context
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  phone TEXT NOT NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.autoreply_rules(id) ON DELETE SET NULL,
  messages JSONB DEFAULT '[]',  -- [{role, content, timestamp}]
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, phone, device_id)
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation - ai_conversations" ON public.ai_conversations
  FOR ALL USING (tenant_id = public.get_user_tenant_id());

CREATE INDEX IF NOT EXISTS idx_ai_conversations_phone ON public.ai_conversations(tenant_id, phone);
