-- Migration 021: Add default bridge config to platform_settings
-- This allows owner/admin to set a global default Bridge URL & API Secret
-- so new users (with no existing wa-web device) get auto-fill on device connect.

INSERT INTO platform_settings (key, value) VALUES
  ('default_bridge_url', ''),
  ('default_bridge_api_secret', '')
ON CONFLICT (key) DO NOTHING;
