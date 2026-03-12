-- Migration: Add read status to messages

-- 1. Add the is_read column to the messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;

-- 2. Create an index to speed up fetching unread counts
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON public.messages(is_read);

-- 3. Set outbound messages to is_read = true by default as they are sent by the owner/bot
UPDATE public.messages SET is_read = true WHERE direction = 'outbound' AND is_read = false;
