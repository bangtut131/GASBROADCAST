-- Migration 013: Add Multiple Captions Support to WA Status Schedules
-- Run in Supabase SQL Editor

ALTER TABLE public.status_schedules
ADD COLUMN IF NOT EXISTS caption_templates TEXT[] DEFAULT '{}';

-- Existing caption_template (singular) will be kept for backward compatibility,
-- or we can just ignore it and use caption_templates from now on.
