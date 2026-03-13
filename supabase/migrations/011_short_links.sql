-- Short Links for Unsubscribe URLs
CREATE TABLE IF NOT EXISTS public.short_links (
    id TEXT PRIMARY KEY,
    target_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

-- Allow public read access to short links (so the redirector can read them without auth)
CREATE POLICY "Public can read short links"
  ON public.short_links FOR SELECT
  USING (true);

-- No insert policies, as insertion will be handled securely by the backend using SERVICE_ROLE_KEY
