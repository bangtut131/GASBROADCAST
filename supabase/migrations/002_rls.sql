-- ============================================
-- WEB BROADCAST — Row Level Security Policies
-- Migration 002: RLS
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autoreply_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

-- Helper function: get user's tenant_id
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- === TENANTS ===
CREATE POLICY "Users can view their own tenant"
  ON public.tenants FOR SELECT
  USING (id = public.get_user_tenant_id());

CREATE POLICY "Owners can update their tenant"
  ON public.tenants FOR UPDATE
  USING (id = public.get_user_tenant_id())
  WITH CHECK (id = public.get_user_tenant_id());

-- === PROFILES ===
CREATE POLICY "Users can view profiles in their tenant"
  ON public.profiles FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- === DEVICES ===
CREATE POLICY "Users can view devices in their tenant"
  ON public.devices FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert devices in their tenant"
  ON public.devices FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update devices in their tenant"
  ON public.devices FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can delete devices in their tenant"
  ON public.devices FOR DELETE
  USING (tenant_id = public.get_user_tenant_id());

-- === CONTACTS ===
CREATE POLICY "Users can view contacts in their tenant"
  ON public.contacts FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert contacts in their tenant"
  ON public.contacts FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update contacts in their tenant"
  ON public.contacts FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can delete contacts in their tenant"
  ON public.contacts FOR DELETE
  USING (tenant_id = public.get_user_tenant_id());

-- === CONTACT GROUPS ===
CREATE POLICY "Users can view contact groups in their tenant"
  ON public.contact_groups FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert contact groups in their tenant"
  ON public.contact_groups FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update contact groups in their tenant"
  ON public.contact_groups FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can delete contact groups in their tenant"
  ON public.contact_groups FOR DELETE
  USING (tenant_id = public.get_user_tenant_id());

-- === CONTACT GROUP MEMBERS ===
CREATE POLICY "Users can view group members in their tenant"
  ON public.contact_group_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.contact_groups g
      WHERE g.id = group_id AND g.tenant_id = public.get_user_tenant_id()
    )
  );

CREATE POLICY "Users can manage group members in their tenant"
  ON public.contact_group_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contact_groups g
      WHERE g.id = group_id AND g.tenant_id = public.get_user_tenant_id()
    )
  );

CREATE POLICY "Users can delete group members in their tenant"
  ON public.contact_group_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.contact_groups g
      WHERE g.id = group_id AND g.tenant_id = public.get_user_tenant_id()
    )
  );

-- === CAMPAIGNS ===
CREATE POLICY "Users can view campaigns in their tenant"
  ON public.campaigns FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert campaigns in their tenant"
  ON public.campaigns FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update campaigns in their tenant"
  ON public.campaigns FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can delete campaigns in their tenant"
  ON public.campaigns FOR DELETE
  USING (tenant_id = public.get_user_tenant_id());

-- === BROADCAST MESSAGES ===
CREATE POLICY "Users can view broadcast messages in their tenant"
  ON public.broadcast_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id AND c.tenant_id = public.get_user_tenant_id()
    )
  );

CREATE POLICY "Users can insert broadcast messages in their tenant"
  ON public.broadcast_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id AND c.tenant_id = public.get_user_tenant_id()
    )
  );

CREATE POLICY "Users can update broadcast messages in their tenant"
  ON public.broadcast_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id AND c.tenant_id = public.get_user_tenant_id()
    )
  );

-- === MESSAGES ===
CREATE POLICY "Users can view messages in their tenant"
  ON public.messages FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert messages in their tenant"
  ON public.messages FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update messages in their tenant"
  ON public.messages FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id());

-- === AUTOREPLY RULES ===
CREATE POLICY "Users can view autoreply rules in their tenant"
  ON public.autoreply_rules FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert autoreply rules in their tenant"
  ON public.autoreply_rules FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update autoreply rules in their tenant"
  ON public.autoreply_rules FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can delete autoreply rules in their tenant"
  ON public.autoreply_rules FOR DELETE
  USING (tenant_id = public.get_user_tenant_id());

-- === API KEYS ===
CREATE POLICY "Users can view API keys in their tenant"
  ON public.api_keys FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert API keys in their tenant"
  ON public.api_keys FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update API keys in their tenant"
  ON public.api_keys FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can delete API keys in their tenant"
  ON public.api_keys FOR DELETE
  USING (tenant_id = public.get_user_tenant_id());

-- === WEBHOOKS ===
CREATE POLICY "Users can view webhooks in their tenant"
  ON public.webhooks FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert webhooks in their tenant"
  ON public.webhooks FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update webhooks in their tenant"
  ON public.webhooks FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can delete webhooks in their tenant"
  ON public.webhooks FOR DELETE
  USING (tenant_id = public.get_user_tenant_id());

-- === Trigger: Auto-create tenant + profile on signup ===
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_tenant_id UUID;
  user_name TEXT;
  tenant_slug TEXT;
BEGIN
  user_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  tenant_slug := LOWER(REPLACE(user_name, ' ', '-')) || '-' || LEFT(NEW.id::TEXT, 8);
  
  -- Create tenant
  INSERT INTO public.tenants (name, slug)
  VALUES (user_name || '''s Workspace', tenant_slug)
  RETURNING id INTO new_tenant_id;
  
  -- Create profile
  INSERT INTO public.profiles (id, tenant_id, full_name, role)
  VALUES (NEW.id, new_tenant_id, user_name, 'owner');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
