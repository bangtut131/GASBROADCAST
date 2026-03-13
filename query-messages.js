const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
    const [key, ...val] = line.split('=');
    if (key && val) acc[key] = val.join('=').trim();
    return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log("== OUTBOUND MESSAGES ==");
    const { data: outbox } = await supabase.from('messages')
        .select('phone, direction, content, created_at')
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(5);
    console.log(JSON.stringify(outbox));
    
    console.log("\n== INBOUND MESSAGES ==");
    const { data: inbox } = await supabase.from('messages')
        .select('phone, direction, content, created_at')
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(5);
    console.log(JSON.stringify(inbox));
}
run();
