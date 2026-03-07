-- Create public storage bucket for WA Status media files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'wa-status',
    'wa-status',
    true,
    10485760,  -- 10MB max per file
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their tenant folder
CREATE POLICY "Authenticated users can upload wa-status files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'wa-status');

-- Allow authenticated users to delete their own files
CREATE POLICY "Authenticated users can delete wa-status files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'wa-status');

-- Public read access (so WhatsApp can download the images)
CREATE POLICY "Public read access for wa-status"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'wa-status');
