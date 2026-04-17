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

        // --- Phase 2: Click each result to get phone from detail panel ---
        // Instead of page.goto() (slow full navigation), we click each card in the
        // sidebar feed. Google Maps opens the detail panel on the same page.
        // This is ~3-5x faster: ~1s per result vs ~4s with page.goto().
        const needPhone = results.filter(function(r) { return !r.phone; });
        console.log(`[Scraper] ${needPhone.length}/${results.length} results need phone. Clicking detail panels...`);

        if (needPhone.length > 0) {
            // Go back to search results page first (in case we navigated away)
            const currentUrl = page.url();
            if (!currentUrl.includes('/maps/search/')) {
                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await delay(2000, 3000);
                await page.waitForSelector(feedSelector, { timeout: 15000 }).catch(() => null);
                // Re-scroll to load all results
                for (let s = 0; s < Math.ceil(maxResults / 7) + 2; s++) {
                    await page.evaluate((sel: string) => {
                        const feed = document.querySelector(sel);
                        if (feed) feed.scrollTop = feed.scrollHeight;
                    }, feedSelector);
                    await delay(1000, 2000);
                }
            }

            // Build a map of name -> result index for matching
            const nameToIdx = new Map<string, number>();
            for (let i = 0; i < results.length; i++) {
                if (!results[i].phone) {
                    nameToIdx.set(results[i].name, i);
                }
            }

            // Get all clickable links in the feed
            const linkHandles = await page.$$('div[role="feed"] > div > div > a[href*="/maps/place/"]');
            console.log(`[Scraper] Found ${linkHandles.length} clickable links in feed`);

            let phonesFound = 0;
            for (let i = 0; i < linkHandles.length; i++) {
                // Get the name from link's parent card to match with our results
                const cardName = await linkHandles[i].evaluate((el: Element) => {
                    const card = el.closest('div');
                    if (!card) return '';
                    const parent = card.parentElement?.parentElement;
                    if (!parent) return '';
                    const nameEl = parent.querySelector('.fontHeadlineSmall, .qBF1Pd');
                    return nameEl && nameEl.textContent ? nameEl.textContent.trim() : '';
                }).catch(() => '');

                // Skip if this result already has a phone or we can't match it
                const resultIdx = nameToIdx.get(cardName);
                if (resultIdx === undefined) continue;

                try {
                    // Click the link to open the detail panel
                    await linkHandles[i].click();
                    await delay(1200, 2000);

                    // Extract phone from the detail panel
                    const detail = await page.evaluate(function() {
                        // Method 1: tel: link
                        const phoneEl = document.querySelector('a[href^="tel:"]');
                        const phoneAttr = phoneEl ? phoneEl.getAttribute('href') : '';
                        let phone = phoneAttr ? phoneAttr.replace('tel:', '') : '';
                        if (!phone && phoneEl && phoneEl.textContent) {
                            phone = phoneEl.textContent.trim();
                        }

                        // Method 2: phone button with data-item-id
                        if (!phone) {
                            const buttons = document.querySelectorAll('button[data-item-id*="phone"]');
                            for (let j = 0; j < buttons.length; j++) {
                                const txt = buttons[j].textContent ? buttons[j].textContent.trim() : '';
                                const match = txt.match(/(\+?\d[\d\s\-()]{8,}\d)/);
                                if (match) { phone = match[1]; break; }
                            }
                        }

                        // Method 3: aria-label with phone pattern
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

                    if (detail.phone) {
                        results[resultIdx].phone = detail.phone;
                        phonesFound++;
                    }
                    if (detail.website && !results[resultIdx].website) {
                        results[resultIdx].website = detail.website;
                    }

                    // Click back to return to the list
                    const backBtn = await page.$('button[aria-label="Back"], button[aria-label="Kembali"]');
                    if (backBtn) {
                        await backBtn.click();
                        await delay(800, 1200);
                    } else {
                        // Fallback: press Escape or navigate back
                        await page.keyboard.press('Escape');
                        await delay(800, 1200);
                    }

                    // Log progress every 10
                    if ((phonesFound + i) % 10 === 0 && i > 0) {
                        console.log(`[Scraper] Detail progress: ${i + 1}/${linkHandles.length}, phones found: ${phonesFound}`);
                    }
                } catch {
                    // If click fails, try to go back to list
                    try {
                        const backBtn = await page.$('button[aria-label="Back"], button[aria-label="Kembali"]');
                        if (backBtn) await backBtn.click();
                        else await page.keyboard.press('Escape');
                        await delay(500, 800);
                    } catch { }
                }
            }

            console.log(`[Scraper] Detail phase complete. Found ${phonesFound} additional phones.`);
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
