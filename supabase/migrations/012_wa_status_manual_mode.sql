-- Migration 012: Add manual content selection to WA Status Schedules
-- Run in Supabase SQL Editor

-- Add content_ids column to status_schedules to support manual mode
ALTER TABLE public.status_schedules
ADD COLUMN IF NOT EXISTS content_ids UUID[] DEFAULT '{}';

-- Since 'manual' mode is already handled in the CHECK constraint of `mode` 
-- (see 005_wa_status.sql: mode TEXT NOT NULL DEFAULT 'random' CHECK (mode IN ('random', 'sequence', 'manual')))
-- we don't need to alter the mode column itself.
