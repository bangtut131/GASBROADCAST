require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAdminAccount() {
  console.log('Fetching profiles...');
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', 'acepyudiachmadi@gmail.com');
    
  if (pErr) console.error('Profile error:', pErr);
  console.log('Profiles found:', profiles?.length);
  
  if (profiles && profiles.length > 0) {
    const p = profiles[0];
    console.log('Admin Profile:', p);
    
    if (p.tenant_id) {
      console.log('Fetching tenant:', p.tenant_id);
      const { data: tenant, error: tErr } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', p.tenant_id)
        .single();
        
      if (tErr) console.error('Tenant error:', tErr);
      console.log('Admin Tenant:', tenant);
    }
  }
}

checkAdminAccount();
