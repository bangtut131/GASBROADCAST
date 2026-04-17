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

        // --- Phase 2: Click each result in the feed to get phone from detail panel ---
        // Google Maps shows phone on the detail panel (right side) when you click a card.
        // We click each card, extract phone, then press Back. No full page.goto().
        const missingPhoneCount = results.filter(r => !r.phone).length;
        console.log(`[Scraper] ${missingPhoneCount}/${results.length} results need phone. Starting detail clicks...`);

        if (missingPhoneCount > 0) {
            // Build URL -> result index map for matching
            const urlToIdx = new Map<string, number>();
            for (let i = 0; i < results.length; i++) {
                if (!results[i].phone && results[i].placeUrl) {
                    urlToIdx.set(results[i].placeUrl, i);
                }
            }

            let phonesFound = 0;
            let consecutiveFails = 0;
            const startTime = Date.now();
            const timeBudgetMs = 250_000; // Stop detail clicks after ~4 min to leave buffer

            // We iterate by index, re-querying links each time to avoid stale element references
            let linkIndex = 0;
            while (linkIndex < 300 && consecutiveFails < 5 && (Date.now() - startTime) < timeBudgetMs) {
                // Re-query all links in the feed each iteration (handles stale refs after back nav)
                const allLinks = await page.$$('div[role="feed"] > div > div > a[href*="/maps/place/"]').catch(() => []);
                if (linkIndex >= allLinks.length) break;

                const link = allLinks[linkIndex];
                linkIndex++;

                // Get this link's href to match with our results
                const href = await link.evaluate((el: Element) => el.getAttribute('href') || '').catch(() => '');
                if (!href) continue;

                // Find matching result that needs phone
                let matchIdx = -1;
                for (const [url, idx] of urlToIdx.entries()) {
                    // Match by checking if the href contains the same place path
                    if (href === url || href.includes(url.split('/maps/place/')[1]?.split('/')[0] || '___NOMATCH___')) {
                        matchIdx = idx;
                        break;
                    }
                }
                if (matchIdx === -1) continue; // This card already has phone or no match

                try {
                    // Scroll the link into view and click it
                    await link.evaluate((el: Element) => el.scrollIntoView({ block: 'center' }));
                    await delay(200, 400);
                    await link.click();

                    // Wait for detail panel to appear (tel: link or phone button)
                    await page.waitForSelector('a[href^="tel:"], button[data-item-id*="phone"], button[aria-label*="Telepon"], button[aria-label*="Phone"]', { timeout: 5000 }).catch(() => null);
                    await delay(800, 1200);

                    // Extract phone from detail panel
                    const phone = await page.evaluate(function() {
                        // Method 1: tel: link
                        const phoneEl = document.querySelector('a[href^="tel:"]');
                        if (phoneEl) {
                            const href = phoneEl.getAttribute('href') || '';
                            const phone = href.replace('tel:', '').replace(/[\s\-()]/g, '');
                            if (phone) return phone;
                            const txt = phoneEl.textContent || '';
                            if (txt) return txt.trim().replace(/[\s\-()]/g, '');
                        }

                        // Method 2: phone button
                        const buttons = document.querySelectorAll('button[data-item-id*="phone"]');
                        for (let j = 0; j < buttons.length; j++) {
                            const txt = buttons[j].textContent || '';
                            const match = txt.match(/(\+?\d[\d\s\-()]{8,}\d)/);
                            if (match) return match[1].replace(/[\s\-()]/g, '');
                        }

                        // Method 3: aria-label
                        const allBtns = document.querySelectorAll('button[aria-label]');
                        for (let j = 0; j < allBtns.length; j++) {
                            const label = allBtns[j].getAttribute('aria-label') || '';
                            const match = label.match(/(\+?\d[\d\s\-()]{8,}\d)/);
                            if (match) return match[1].replace(/[\s\-()]/g, '');
                        }

                        return '';
                    }).catch(() => '');

                    if (phone) {
                        results[matchIdx].phone = phone;
                        urlToIdx.delete(results[matchIdx].placeUrl);
                        phonesFound++;
                        consecutiveFails = 0;
                    } else {
                        consecutiveFails++;
                    }

                    // Also grab website if missing
                    if (!results[matchIdx].website) {
                        const website = await page.evaluate(() => {
                            const el = document.querySelector('a[data-item-id="authority"]') as HTMLAnchorElement;
                            return el && el.href ? el.href : '';
                        }).catch(() => '');
                        if (website) results[matchIdx].website = website;
                    }

                    // Navigate back to the list
                    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(async () => {
                        // Fallback: try back button or escape
                        const backBtn = await page.$('button[aria-label="Back"], button[aria-label="Kembali"]');
                        if (backBtn) await backBtn.click();
                        else await page.keyboard.press('Escape');
                    });

                    // Wait for feed to reappear
                    await page.waitForSelector(feedSelector, { timeout: 8000 }).catch(() => null);
                    await delay(400, 800);

                    // Stop if all phones found
                    if (urlToIdx.size === 0) break;

                    // Log progress every 10
                    if (phonesFound % 10 === 0 && phonesFound > 0) {
                        console.log(`[Scraper] Detail progress: phones=${phonesFound}, remaining=${urlToIdx.size}, time=${Math.round((Date.now() - startTime) / 1000)}s`);
                    }
                } catch {
                    consecutiveFails++;
                    // Try to recover back to list
                    try {
                        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => null);
                        await page.waitForSelector(feedSelector, { timeout: 5000 }).catch(() => null);
                        await delay(500, 800);
                    } catch { }
                }
            }

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.log(`[Scraper] Detail phase complete: ${phonesFound} phones found in ${elapsed}s. ${consecutiveFails >= 5 ? 'Stopped: 5 consecutive failures.' : ''}`);
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
