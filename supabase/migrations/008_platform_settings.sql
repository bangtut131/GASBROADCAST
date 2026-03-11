-- Platform settings (key-value) for owner/admin configuration
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default values
INSERT INTO platform_settings (key, value) VALUES
  ('platform_name', 'GAS Broadcast'),
  ('owner_name', ''),
  ('owner_email', ''),
  ('owner_phone', ''),
  ('owner_whatsapp', ''),
  ('platform_logo_url', ''),
  ('upgrade_message', 'Hubungi kami untuk upgrade paket langganan Anda. Kami siap membantu!')
ON CONFLICT (key) DO NOTHING;

-- Allow public read (for showing contact info on subscription page)
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read platform_settings" ON platform_settings FOR SELECT USING (true);
CREATE POLICY "Owner update platform_settings" ON platform_settings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
);
