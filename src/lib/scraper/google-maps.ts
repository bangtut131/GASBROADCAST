import chromium from '@sparticuz/chromium';

export interface ScrapedBusiness {
    name: string;
    phone: string;
    address: string;
    category: string;
    rating: string;
    reviewCount: string;
    website: string;
    placeUrl: string;
}

// Random delay to mimic human behavior
function delay(min: number, max: number): Promise<void> {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Random user agents for rotation
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
];

export async function scrapeGoogleMaps(
    query: string,
    maxResults: number = 40
): Promise<{ results: ScrapedBusiness[]; error?: string }> {
    let browser: any = null;

    try {
        // Dynamic import for puppeteer-extra (ESM compatibility)
        const puppeteerExtra = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        puppeteerExtra.use(StealthPlugin());

        const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

        // Launch browser
        browser = await puppeteerExtra.launch({
            args: [
                ...chromium.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process',
                `--user-agent=${userAgent}`,
            ],
            defaultViewport: { width: 1366, height: 768 },
            executablePath: await chromium.executablePath(),
            headless: true,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();

        // Set extra headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        });

        // Block unnecessary resources for speed
        await page.setRequestInterception(true);
        page.on('request', (req: any) => {
            const type = req.resourceType();
            if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Navigate to Google Maps search
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        // Wait for results to load
        await delay(2000, 4000);

        // Try to find the results panel (scrollable list)
        const feedSelector = 'div[role="feed"]';
        await page.waitForSelector(feedSelector, { timeout: 15000 }).catch(() => null);

        // Scroll to load more results
        let previousCount = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = Math.ceil(maxResults / 7) + 3; // ~7 results per scroll

        while (scrollAttempts < maxScrollAttempts) {
            // Count current results
            const currentCount = await page.$$eval(
                'div[role="feed"] > div > div > a[href*="/maps/place/"]',
                (els: any[]) => els.length
            ).catch(() => 0);

            if (currentCount >= maxResults) break;
            if (currentCount === previousCount && scrollAttempts > 2) break; // No new results
            previousCount = currentCount;

            // Scroll the feed panel
            await page.evaluate((selector: string) => {
                const feed = document.querySelector(selector);
                if (feed) feed.scrollTop = feed.scrollHeight;
            }, feedSelector);

            await delay(2500, 5000); // Human-like delay between scrolls
            scrollAttempts++;
        }

        // Extract data from results
        const results: ScrapedBusiness[] = await page.evaluate((max: number) => {
            const items: any[] = [];
            const cards = document.querySelectorAll('div[role="feed"] > div > div');

            for (const card of Array.from(cards)) {
                if (items.length >= max) break;

                const link = card.querySelector('a[href*="/maps/place/"]') as HTMLAnchorElement;
                if (!link) continue;

                const nameEl = card.querySelector('.fontHeadlineSmall, .qBF1Pd');
                const ratingEl = card.querySelector('.MW4etd');
                const reviewEl = card.querySelector('.UY7F9');
                const categoryEl = card.querySelector('.W4Efsd .W4Efsd:nth-child(1) > span:nth-child(1)');
                const addressEl = card.querySelector('.W4Efsd:nth-child(2) .W4Efsd, .W4Efsd .W4Efsd:nth-child(2)');

                // Try to get phone from various possible locations
                const allText = card.textContent || '';
                const phoneMatch = allText.match(/(\+?\d[\d\s\-()]{8,})/);

                const name = nameEl?.textContent?.trim() || '';
                if (!name) continue;

                items.push({
                    name,
                    phone: phoneMatch ? phoneMatch[1].replace(/[\s()-]/g, '') : '',
                    address: addressEl?.textContent?.trim() || '',
                    category: categoryEl?.textContent?.trim()?.replace(/·\s*/g, '') || '',
                    rating: ratingEl?.textContent?.trim() || '',
                    reviewCount: reviewEl?.textContent?.trim()?.replace(/[()]/g, '') || '',
                    website: '',
                    placeUrl: link.href || '',
                });
            }
            return items;
        }, maxResults);

        // For results with placeUrl but no phone, try to visit detail page
        // (Only for first 10 to avoid too many requests)
        const needPhone = results.filter(r => !r.phone && r.placeUrl).slice(0, 10);
        for (const biz of needPhone) {
            try {
                await page.goto(biz.placeUrl, { waitUntil: 'networkidle2', timeout: 15000 });
                await delay(1500, 3000);

                const detail = await page.evaluate(() => {
                    const phoneBtn = document.querySelector('button[data-tooltip="Salin nomor telepon"], button[data-tooltip="Copy phone number"], a[href^="tel:"]');
                    const phoneEl = phoneBtn?.closest('[data-item-id]')?.querySelector('.Io6YTe, .rogA2c') ||
                        document.querySelector('a[href^="tel:"]');
                    const websiteEl = document.querySelector('a[data-item-id="authority"]');
                    return {
                        phone: phoneEl?.textContent?.trim()?.replace(/[\s()-]/g, '') || '',
                        website: (websiteEl as HTMLAnchorElement)?.href || '',
                    };
                });

                if (detail.phone) biz.phone = detail.phone;
                if (detail.website) biz.website = detail.website;
            } catch {
                // Skip on error
            }
        }

        return { results };
    } catch (error: any) {
        return { results: [], error: error.message };
    } finally {
        if (browser) {
            try { await browser.close(); } catch { }
        }
    }
}
