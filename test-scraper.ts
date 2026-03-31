import { scrapeGoogleMaps } from './src/lib/scraper/google-maps';

async function test() {
    console.log('Starting scraper...');
    const result = await scrapeGoogleMaps('toko pertanian di wonosobo', 5);
    console.log(JSON.stringify(result, null, 2));
}

test().catch(console.error);
