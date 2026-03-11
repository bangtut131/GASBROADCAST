-- Add greetings column to campaigns for random greeting feature
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS greetings JSONB DEFAULT NULL;
