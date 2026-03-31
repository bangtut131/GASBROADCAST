const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables manually
const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data, error } = await supabase.rpc('exec_sql', {
        query: `
            SELECT pol.polname, pol.polcmd
            FROM pg_policy pol
            JOIN pg_class t ON pol.polrelid = t.oid
            WHERE t.relname = 'scraper_jobs';
        `
    });

    if (error) {
        console.error('RPC Error:', error.message);
        // Fallback: let's try direct postgres via node-postgres
        const { Client } = require('pg');
        const client = new Client({
            connectionString: process.env.DATABASE_URL
        });
        await client.connect();
        const res = await client.query(`
            SELECT pol.polname, pol.polcmd
            FROM pg_policy pol
            JOIN pg_class t ON pol.polrelid = t.oid
            WHERE t.relname = 'scraper_jobs';
        `);
        console.log("Policies:", res.rows);
        await client.end();
    } else {
        console.log("Policies:", data);
    }
}

main().catch(console.error);
