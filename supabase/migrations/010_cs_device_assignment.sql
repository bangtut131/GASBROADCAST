-- Migration: Add assigned_devices to team_members and update registration trigger

-- 1. Add assigned_devices column to team_members
ALTER TABLE public.team_members
ADD COLUMN IF NOT EXISTS assigned_devices UUID[] DEFAULT '{}';


-- 2. Update the signup trigger to handle Agent Auto-Linking
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_tenant_id UUID;
  user_name TEXT;
  tenant_slug TEXT;
  existing_team_member RECORD;
BEGIN
  user_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  
  -- Check if this email exists as a pre-invited team member
  SELECT * INTO existing_team_member 
  FROM public.team_members 
  WHERE email = NEW.email 
  LIMIT 1;

  IF FOUND THEN
    -- This user was invited as an agent/member by a Tenant Admin.
    -- Do NOT create a new tenant. Just attach them to the existing tenant.
    INSERT INTO public.profiles (id, tenant_id, full_name, role)
    VALUES (NEW.id, existing_team_member.tenant_id, user_name, existing_team_member.role);
    
    RETURN NEW;
  END IF;

  -- Normal Flow: Create a new Tenant (Workspace) for this new owner
  tenant_slug := LOWER(REPLACE(REPLACE(user_name, ' ', '-'), '.', '-')) || '-' || LEFT(NEW.id::TEXT, 8);
  
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
