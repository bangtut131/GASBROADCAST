require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testInsert() {
  const { data: tenant } = await supabase.from('tenants').select('id').limit(1).single();
  if (!tenant) return console.log('No tenant found');
  
  const { data: rule } = await supabase.from('autoreply_rules').select('id').limit(1).single();
  if (!rule) return console.log('No rule found');

  const { data, error } = await supabase.from('ai_knowledge_files').insert({
    tenant_id: tenant.id,
    rule_id: rule.id,
    title: 'test',
    category: 'general',
    content: 'test',
    source_type: 'manual',
    file_name: 'test.pdf'
  }).select().single();

  console.log('Insert result:', data);
  if (error) {
    console.error('Insert Error:', error);
  } else {
    // cleanup
    await supabase.from('ai_knowledge_files').delete().eq('id', data.id);
  }
}

testInsert();
