CREATE TABLE IF NOT EXISTS public.blacklisted_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, phone)
);

-- RLS
ALTER TABLE public.blacklisted_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's blacklist" ON public.blacklisted_contacts
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert to their tenant's blacklist" ON public.blacklisted_contacts
    FOR INSERT WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update their tenant's blacklist" ON public.blacklisted_contacts
    FOR UPDATE USING (
        tenant_id IN (
            SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their tenant's blacklist" ON public.blacklisted_contacts
    FOR DELETE USING (
        tenant_id IN (
            SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
    );
