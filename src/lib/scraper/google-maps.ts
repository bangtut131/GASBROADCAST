import puppeteer from 'puppeteer';

export interface ScrapedBusiness {
    name: string;
    phone: string;
    address: string;
    hours: string;
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

// Random user agents (Stealth plugin also handles this, but we can keep it as fallback)
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
];

export async function scrapeGoogleMaps(
    query: string,
    maxResults: number = 40
): Promise<{ results: ScrapedBusiness[]; error?: string }> {
    let browser: any = null;

    try {
        const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        // Launch with stealth
        browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled' // Extra anti-bot args
            ],
            defaultViewport: { width: 1366, height: 768 },
            headless: true, 
        });

        const page = await browser.newPage();

        // Manual stealth: set user agent
        await page.setUserAgent(userAgent);

        // Manual stealth: override navigator.webdriver
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            // @ts-ignore
            window.chrome = { runtime: {} };
            Object.defineProperty(navigator, 'languages', { get: () => ['id-ID', 'id', 'en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        });

        // Set headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        });

        // Block heavy resources for speed
        await page.setRequestInterception(true);
        page.on('request', (req: any) => {
            const type = req.resourceType();
            if (['image', 'media', 'font'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Navigate to Google Maps search
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for content
        await delay(3000, 5000);

        // Try accept cookies if prompted
        try {
            const acceptBtn = await page.$('button[aria-label*="Accept"], form[action*="consent"] button');
            if (acceptBtn) { await acceptBtn.click(); await delay(1000, 2000); }
        } catch { }

        // Wait for results feed
        const feedSelector = 'div[role="feed"]';
        await page.waitForSelector(feedSelector, { timeout: 15000 }).catch(() => null);

        // Scroll to load results
        let previousCount = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = Math.ceil(maxResults / 7) + 3;

        while (scrollAttempts < maxScrollAttempts) {
            const currentCount = await page.$$eval(
                'div[role="feed"] > div > div > a[href*="/maps/place/"]',
                (els: Element[]) => els.length
            ).catch(() => 0);

            if (currentCount >= maxResults) break;
            if (currentCount === previousCount && scrollAttempts > 2) break;
            previousCount = currentCount;

            // Scroll the feed
            await page.evaluate((sel: string) => {
                const feed = document.querySelector(sel);
                if (feed) feed.scrollTop = feed.scrollHeight;
            }, feedSelector);

            await delay(2000, 4000);
            scrollAttempts++;
        }

        // Extract data
        const results: ScrapedBusiness[] = await page.evaluate(function (max: number) {
            const items: any[] = [];
            const cards = document.querySelectorAll('div[role="feed"] > div > div');

            for (let i = 0; i < cards.length; i++) {
                if (items.length >= max) break;
                const card = cards[i];

                const link = card.querySelector('a[href*="/maps/place/"]') as HTMLAnchorElement;
                if (!link) continue;

                const nameEl = card.querySelector('.fontHeadlineSmall, .qBF1Pd');
                const ratingEl = card.querySelector('.MW4etd');
                const reviewEl = card.querySelector('.UY7F9');

                // Helper: detect if text is business hours
                const isHoursText = function(t: string) {
                    const lower = t.toLowerCase();
                    return /(buka|tutup|open|closed|24\s*jam|hours)/i.test(lower) ||
                        /\b\d{1,2}[.:.]\d{2}\b/.test(t) ||
                        /(senin|selasa|rabu|kamis|jumat|sabtu|minggu|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(lower) ||
                        /⋅/.test(t);
                };

                // Get all W4Efsd spans for category/address/hours
                const infoSpans = card.querySelectorAll('.W4Efsd');
                let category = '';
                let address = '';
                let hours = '';
                const textParts: string[] = [];

                for (let j = 0; j < infoSpans.length; j++) {
                    const span = infoSpans[j];
                    const innerSpans = span.querySelectorAll(':scope > span');
                    if (innerSpans.length > 0) {
                        for (let k = 0; k < innerSpans.length; k++) {
                            const s = innerSpans[k];
                            const t = s.textContent ? s.textContent.trim() : '';
                            if (t && t !== '·' && t !== '⋅') textParts.push(t);
                        }
                    } else {
                        const t = span.textContent ? span.textContent.trim() : '';
                        if (t) textParts.push(t);
                    }
                }

                // Parse text parts
                for (let j = 0; j < textParts.length; j++) {
                    const part = textParts[j];
                    const clean = part.replace(/^[·⋅\s]+|[·⋅\s]+$/g, '').trim();
                    if (!clean) continue;

                    if (isHoursText(clean)) {
                        if (!hours) hours = clean;
                    } else if (!category && clean.length < 40 && !/\d{3,}/.test(clean)) {
                        category = clean;
                    } else if (clean.length > 10 && !isHoursText(clean)) {
                        if (!address || clean.length > address.length) address = clean;
                    }
                }

                // Phone from text content
                const allText = card.textContent || '';
                const phoneMatch = allText.match(/(\+?\d[\d\s\-()]{8,}\d)/);

                const name = nameEl && nameEl.textContent ? nameEl.textContent.trim() : '';
                if (!name) continue;

                items.push({
                    name: name,
                    phone: phoneMatch ? phoneMatch[1].replace(/[\s\-()]/g, '') : '',
                    address: address,
                    hours: hours,
                    category: category.replace(/·\s*/g, '').trim(),
                    rating: ratingEl && ratingEl.textContent ? ratingEl.textContent.trim() : '',
                    reviewCount: reviewEl && reviewEl.textContent ? reviewEl.textContent.trim().replace(/[()]/g, '') : '',
                    website: '',
                    placeUrl: link.href || '',
                });
            }
            return items;
        }, maxResults);

        // Visit detail pages for ALL results missing phone number
        // Previously capped at 5-10, causing most results to have no phone data
        const needDetail = results.filter(function(r) { return r.placeUrl && (!r.phone || !r.website); });
        console.log(`[Scraper] Visiting ${needDetail.length} detail pages for phone/website data...`);

        for (let i = 0; i < needDetail.length; i++) {
            const biz = needDetail[i];
            try {
                await page.goto(biz.placeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await delay(1500, 3000);

                const detail = await page.evaluate(function() {
                    // Method 1: tel: link
                    const phoneEl = document.querySelector('a[href^="tel:"]');
                    const phoneAttr = phoneEl ? phoneEl.getAttribute('href') : '';
                    let phone = phoneAttr ? phoneAttr.replace('tel:', '') : '';
                    if (!phone && phoneEl && phoneEl.textContent) {
                        phone = phoneEl.textContent.trim();
                    }

                    // Method 2: phone button
                    if (!phone) {
                        const buttons = document.querySelectorAll('button[data-item-id*="phone"]');
                        for (let j = 0; j < buttons.length; j++) {
                            const btn = buttons[j];
                            const txt = btn.textContent ? btn.textContent.trim() : '';
                            const match = txt.match(/(\+?\d[\d\s\-()]{8,}\d)/);
                            if (match) { phone = match[1]; break; }
                        }
                    }

                    // Method 3: scan all aria-label containing phone patterns
                    if (!phone) {
                        const allBtns = document.querySelectorAll('button[aria-label]');
                        for (let j = 0; j < allBtns.length; j++) {
                            const label = allBtns[j].getAttribute('aria-label') || '';
                            const match = label.match(/(\+?\d[\d\s\-()]{8,}\d)/);
                            if (match) { phone = match[1]; break; }
                        }
                    }

                    const websiteEl = document.querySelector('a[data-item-id="authority"]') as HTMLAnchorElement;
                    const website = websiteEl && websiteEl.href ? websiteEl.href : '';

                    return {
                        phone: phone.replace(/[\s\-()]/g, ''),
                        website: website,
                    };
                });

                if (detail.phone) biz.phone = detail.phone;
                if (detail.website) biz.website = detail.website;

                // Log progress every 10 visits
                if ((i + 1) % 10 === 0) {
                    console.log(`[Scraper] Detail progress: ${i + 1}/${needDetail.length}`);
                }
            } catch {
                // Skip failed detail pages, continue to next
            }

            // Small delay between detail visits to avoid rate limiting
            if (i < needDetail.length - 1) {
                await delay(500, 1500);
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
