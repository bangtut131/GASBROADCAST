const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  console.log('Fetching all contacts...');
  
  // We need to fetch all contacts. Let's do it in reasonably large chunks if needed.
  let allContacts = [];
  let from = 0;
  const size = 1000;
  
  while (true) {
      const { data: contacts, error: cErr } = await supabase.from('contacts').select('id, tenant_id, phone').range(from, from + size - 1);
      if (cErr) { console.error('Error fetching contacts:', cErr); break; }
      if (!contacts || contacts.length === 0) break;
      
      allContacts = allContacts.concat(contacts);
      if (contacts.length < size) break;
      from += size;
  }
  
  console.log(`Found ${allContacts.length} contacts.`);
  
  let updatedCount = 0;
  for (const contact of allContacts) {
      if (!contact.phone || !contact.tenant_id) continue;
      
      const { data: msgs, error: err2 } = await supabase
          .from('messages')
          .update({ contact_id: contact.id })
          .eq('tenant_id', contact.tenant_id)
          .eq('phone', contact.phone)
          .is('contact_id', null)
          .select('id'); // we select id just to know how many were updated
          
      if (err2) {
          console.error(`Error updating msg for phone ${contact.phone}:`, err2.message);
      } else if (msgs && msgs.length > 0) {
          console.log(`Linked ${msgs.length} messages for contact ${contact.phone}`);
          updatedCount += msgs.length;
      }
  }
  
  console.log(`Finished linking ${updatedCount} old messages to their existing contacts!`);
}
fix();
