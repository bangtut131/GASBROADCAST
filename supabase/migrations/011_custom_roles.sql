-- ============================================
-- WEB BROADCAST — Database Schema
-- Migration 011: Custom Admin Roles
-- ============================================

-- Table to store Superadmin-defined custom roles
CREATE TABLE IF NOT EXISTS public.custom_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE, -- e.g., 'Junior CS', 'Marketing Manager'
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g., { "messaging": ["view", "send"], "manage": ["view"] }
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Note: We are not removing the existing 'role' column from `profiles`
-- Instead, the `role` enum in `profiles` can act as the base identifier (like 'owner', 'agent'),
-- and we can either expand the enum or use `custom_role_id` to link to this new table.
-- To keep it simple and backward compatible, we will add a `custom_role_id` reference to profiles.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES public.custom_roles(id) ON DELETE SET NULL;

-- RLS for custom_roles
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can read roles
CREATE POLICY "Anyone can read custom roles"
ON public.custom_roles
FOR SELECT
TO authenticated
USING (true);

-- Only superadmins should be able to create/update/delete.
-- Since Superadmin logic is currently enforced via the ADMIN_EMAILS env variable in the API,
-- true DB-level RLS for superadmins is tricky. We'll secure mutations via the Next.js API layer.
-- Therefore, we leave out INSERT/UPDATE/DELETE policies here, forcing ALL mutations to happen via `service_role` key in our secure API routes.

-- Note: we need to ensure the updated_at column updates automatically
CREATE OR REPLACE FUNCTION update_custom_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trg_custom_roles_updated_at ON public.custom_roles;
CREATE TRIGGER trg_custom_roles_updated_at
BEFORE UPDATE ON public.custom_roles
FOR EACH ROW
EXECUTE FUNCTION update_custom_roles_updated_at();
