-- Migration 020: AI Knowledge Base Files
-- Knowledge files that AI agents reference when replying
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.ai_knowledge_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  rule_id UUID REFERENCES public.autoreply_rules(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,                -- e.g. "Katalog Produk", "Info Perusahaan"
  category TEXT DEFAULT 'general'     -- product, company, faq, policy, general
    CHECK (category IN ('product', 'company', 'faq', 'policy', 'general')),
  content TEXT NOT NULL,              -- the actual knowledge text (extracted from file or manual)
  source_type TEXT DEFAULT 'manual'   -- manual, excel, pdf, csv, text
    CHECK (source_type IN ('manual', 'excel', 'pdf', 'csv', 'text')),
  file_name TEXT,                     -- original filename if uploaded
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_knowledge_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation - ai_knowledge_files" ON public.ai_knowledge_files
  FOR ALL USING (tenant_id = public.get_user_tenant_id());

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_rule ON public.ai_knowledge_files(rule_id);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_tenant ON public.ai_knowledge_files(tenant_id);
