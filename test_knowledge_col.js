require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testSelect() {
  const { data, error } = await supabase.from('ai_knowledge_files').select('id, file_name, created_at').limit(1);
  console.log('Result:', data);
  if (error) {
    console.error('Error:', error);
  }
}

testSelect();
