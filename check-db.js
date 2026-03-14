const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing ENV vars!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Checking recent messages...');
  const { data: msgs, error: err1 } = await supabase.from('messages').select('id, phone, content, created_at, direction').order('created_at', { ascending: false }).limit(3);
  if (err1) console.error('Error fetching messages:', err1);
  else console.log("Recent Messages:", msgs);
  
  console.log('\nChecking recent notifications...');
  const { data: notifs, error: err2 } = await supabase.from('notifications').select('id, title, message, created_at, is_read').order('created_at', { ascending: false }).limit(3);
  if (err2) console.error('Error fetching notifications:', err2);
  else console.log("Recent Notifications:", notifs);
}
check();
