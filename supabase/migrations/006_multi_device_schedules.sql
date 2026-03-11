-- Add device_ids JSONB array to status_schedules for multi-device support
-- Keeps device_id for backward compat (first device), adds device_ids for all

ALTER TABLE public.status_schedules ADD COLUMN IF NOT EXISTS device_ids JSONB DEFAULT '[]';

-- Backfill existing schedules: copy device_id into device_ids array
UPDATE public.status_schedules
  SET device_ids = jsonb_build_array(device_id::text)
  WHERE device_ids = '[]' OR device_ids IS NULL;

-- Make device_id nullable (no longer strictly required since we use device_ids)
ALTER TABLE public.status_schedules ALTER COLUMN device_id DROP NOT NULL;
