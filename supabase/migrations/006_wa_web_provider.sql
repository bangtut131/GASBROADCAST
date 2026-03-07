-- ============================================
-- Migration 006: Add wa-web provider support
-- ============================================

-- Drop the old check constraint and add new one that includes 'wa-web'
ALTER TABLE public.devices
  DROP CONSTRAINT IF EXISTS devices_provider_check;

ALTER TABLE public.devices
  ADD CONSTRAINT devices_provider_check
  CHECK (provider IN ('waha', 'official', 'wa-web'));
