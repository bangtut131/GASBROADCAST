-- Migration 005: WA Status Manager
-- Run in Supabase SQL Editor

-- Content categories
CREATE TABLE IF NOT EXISTS public.status_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6C63FF',
  icon TEXT DEFAULT '📁',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Content library (images, videos, text)
CREATE TABLE IF NOT EXISTS public.status_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.status_categories(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('image', 'video', 'text')),
  title TEXT,
  content_url TEXT,       -- For image/video (Supabase Storage URL or external URL)
  caption TEXT,           -- Text overlay / caption
  tags TEXT[] DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Schedule rules per device
CREATE TABLE IF NOT EXISTS public.status_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  mode TEXT NOT NULL DEFAULT 'random' CHECK (mode IN ('random', 'sequence', 'manual')),
  category_ids UUID[] DEFAULT '{}',   -- Which categories to pick from (empty = all)
  
  -- Schedule config
  cron_expression TEXT,               -- e.g. '0 7,12,18 * * *' (7am, 12pm, 6pm daily)
  times_of_day TEXT[] DEFAULT '{}',   -- Simple: ['07:00', '12:00', '18:00']
  days_of_week INTEGER[] DEFAULT '{0,1,2,3,4,5,6}', -- 0=Sun, 6=Sat
  
  -- Time window
  window_start TEXT DEFAULT '07:00',  -- Don't post before this time
  window_end TEXT DEFAULT '21:00',    -- Don't post after this time
  timezone TEXT DEFAULT 'Asia/Jakarta',
  
  -- Anti-repeat
  cooldown_days INTEGER DEFAULT 3,    -- Don't reuse content within X days
  
  -- Sequence tracking
  sequence_index INTEGER DEFAULT 0,   -- Current position in sequence mode
  
  -- Caption template
  caption_template TEXT,              -- e.g. 'Selamat pagi! {tanggal} 🌅'
  
  -- Stats
  last_posted_at TIMESTAMPTZ,
  total_posted INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Posting history / logs
CREATE TABLE IF NOT EXISTS public.status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES public.status_schedules(id) ON DELETE SET NULL,
  content_id UUID REFERENCES public.status_contents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  posted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.status_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation - status_categories" ON public.status_categories FOR ALL USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Tenant isolation - status_contents" ON public.status_contents FOR ALL USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Tenant isolation - status_schedules" ON public.status_schedules FOR ALL USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Tenant isolation - status_logs" ON public.status_logs FOR ALL USING (tenant_id = public.get_user_tenant_id());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_status_contents_category ON public.status_contents(tenant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_status_contents_type ON public.status_contents(tenant_id, type, is_active);
CREATE INDEX IF NOT EXISTS idx_status_logs_device ON public.status_logs(device_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_schedules_device ON public.status_schedules(device_id, is_active);
