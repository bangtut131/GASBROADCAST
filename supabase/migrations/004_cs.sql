-- Migration 004: CS Assignment columns
-- Run in Supabase SQL Editor

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS cs_assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cs_status TEXT DEFAULT 'unhandled' CHECK (cs_status IN ('unhandled', 'assigned', 'resolved')),
  ADD COLUMN IF NOT EXISTS cs_assigned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_cs_status ON public.contacts(tenant_id, cs_status);
