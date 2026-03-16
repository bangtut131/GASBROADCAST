-- Create enum for scraper job status if not exists
DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Table to store asynchronous background scraper jobs
CREATE TABLE public.scraper_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    max_results INTEGER NOT NULL DEFAULT 40,
    status job_status NOT NULL DEFAULT 'processing',
    count_found INTEGER DEFAULT 0,
    results JSONB DEFAULT '[]'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    completed_at TIMESTAMPTZ
);

-- Index for querying jobs efficiently
CREATE INDEX idx_scraper_jobs_tenant ON public.scraper_jobs(tenant_id);
CREATE INDEX idx_scraper_jobs_user ON public.scraper_jobs(user_id);
CREATE INDEX idx_scraper_jobs_created ON public.scraper_jobs(created_at DESC);

-- RLS Policies
ALTER TABLE public.scraper_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own scraper jobs"
    ON public.scraper_jobs FOR SELECT
    USING (auth.uid() = user_id OR 
           auth.uid() IN (SELECT id FROM public.profiles WHERE tenant_id = scraper_jobs.tenant_id AND role IN ('owner', 'admin')));

CREATE POLICY "Users can create scraper jobs"
    ON public.scraper_jobs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can edit scraper jobs"
    ON public.scraper_jobs FOR UPDATE
    USING (auth.uid() = user_id OR 
           auth.uid() IN (SELECT id FROM public.profiles WHERE tenant_id = scraper_jobs.tenant_id AND role IN ('owner', 'admin')));

CREATE POLICY "Users can delete their own scraper jobs"
    ON public.scraper_jobs FOR DELETE
    USING (auth.uid() = user_id OR 
           auth.uid() IN (SELECT id FROM public.profiles WHERE tenant_id = scraper_jobs.tenant_id AND role IN ('owner', 'admin')));
