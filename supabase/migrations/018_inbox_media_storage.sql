-- ============================================
-- WEB BROADCAST — Inbox Media Storage
-- Migration 018: Supabase Storage bucket for inbox attachments
-- ============================================

-- Create storage bucket for inbox media (images, videos, documents)
-- Run this via Supabase Dashboard > Storage > Create Bucket if migration doesn't work
-- Bucket name: inbox-media
-- Public: true (so media URLs are accessible without auth)

INSERT INTO storage.buckets (id, name, public)
VALUES ('inbox-media', 'inbox-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "Allow authenticated uploads to inbox-media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'inbox-media');

-- Allow public read access for displaying media
CREATE POLICY "Allow public read on inbox-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'inbox-media');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Allow authenticated delete on inbox-media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'inbox-media');
