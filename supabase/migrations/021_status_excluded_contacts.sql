-- Migration 021: Add excluded_contacts to status_schedules
-- UPGRADE: Allows hiding WA status from specific contacts per schedule
-- SAFE: New column only, default empty array, no existing data affected

ALTER TABLE public.status_schedules 
ADD COLUMN IF NOT EXISTS excluded_contacts TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.status_schedules.excluded_contacts IS 'Phone numbers to exclude from status visibility, e.g. {"6281234567890"}. Empty = no exclusion (default behavior).';
