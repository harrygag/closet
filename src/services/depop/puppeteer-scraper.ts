/**
 * Depop Puppeteer Scraper with Stealth Mode
 * Handles bot detection, captchas, and data extraction
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';

// Add stealth plugin to avoid bot detection
puppeteer.use(StealthPlugin());

interface DepopListing {
  id: string;
  title: string;
  price: number;
  description?: string;
  images: string[];
  brand?: string;
  size?: string;
  condition?: string;
  category?: string;
  sold: boolean;
  url: string;
}

interface CaptchaSolverConfig {
  service: 'anticaptcha' | '2captcha' | 'capsolver';
  apiKey: string;
}

interface ScraperOptions {
  headless?: boolean;
  captchaSolver?: CaptchaSolverConfig;
  cookies?: any[];
  proxyUrl?: string;
}

export class DepopPuppeteerScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private options: ScraperOptions;

  constructor(options: ScraperOptions = {}) {
    this.options = {
      headless: true,
      ...options
    };
  }

  /**
   * Initialize browser with stealth mode
   */
  async initialize(): Promise<void> {
    const launchOptions: any = {
      headless: this.options.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ]
    };

    if (this.options.proxyUrl) {
      launchOptions.args.push(`--proxy-server=${this.options.proxyUrl}`);
    }

    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();

    // Set viewport
    await this.page.setViewport({ width: 1920, height: 1080 });

    // Set extra headers to appear more human
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1'
    });

    // Load cookies if provided
    if (this.options.cookies && this.options.cookies.length > 0) {
      await this.page.setCookie(...this.options.cookies);
      console.log('[Puppeteer] Loaded', this.options.cookies.length, 'cookies');
    }

    // Add random mouse movements to appear more human
    await this.addHumanBehavior();
  }

  /**
   * Add random human-like behavior
   */
  private async addHumanBehavior(): Promise<void> {
    if (!this.page) return;

    // Random mouse movements
    await this.page.evaluate(() => {
      const randomMove = () => {
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * window.innerHeight;
        const event = new MouseEvent('mousemove', {
          clientX: x,
          clientY: y,
          bubbles: true
        });
        document.dispatchEvent(event);
      };

      // Move mouse every 2-5 seconds
      setInterval(randomMove, 2000 + Math.random() * 3000);
    });
  }

  /**
   * Fetch user's Depop listings
   */
  async fetchUserListings(username: string): Promise<DepopListing[]> {
    if (!this.page) {
      await this.initialize();
    }

    console.log('[Puppeteer] Fetching listings for @' + username);

    const url = `https://www.depop.com/${username}`;

    try {
      // Navigate to user profile
      await this.page!.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for page to load
      await this.randomDelay(1000, 3000);

      // Check for captcha
      const hasCaptcha = await this.detectCaptcha();
      if (hasCaptcha) {
        console.log('[Puppeteer] Captcha detected, solving...');
        await this.solveCaptcha();
      }

      // Scroll to load all products (lazy loading)
      await this.scrollToLoadAll();

      // Extract listings from __NEXT_DATA__ (fastest method)
      const listings = await this.extractListingsFromPageData();

      console.log('[Puppeteer] Extracted', listings.length, 'listings');

      return listings;

    } catch (error) {
      console.error('[Puppeteer] Error fetching listings:', error);

      // Take screenshot for debugging
      if (this.page) {
        await this.page.screenshot({ path: 'depop-error.png' });
        console.log('[Puppeteer] Screenshot saved to depop-error.png');
      }

      throw error;
    }
  }

  /**
   * Detect if captcha is present
   */
  private async detectCaptcha(): Promise<boolean> {
    if (!this.page) return false;

    const captchaSelectors = [
      '.g-recaptcha',
      '.h-captcha',
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      '[data-sitekey]',
      '[data-turnstile-sitekey]'
    ];

    for (const selector of captchaSelectors) {
      const element = await this.page.$(selector);
      if (element) {
        console.log('[Puppeteer] Detected captcha:', selector);
        return true;
      }
    }

    return false;
  }

  /**
   * Solve captcha using configured service
   */
  private async solveCaptcha(): Promise<void> {
    if (!this.page || !this.options.captchaSolver) {
      throw new Error('Captcha solver not configured');
    }

    // Extract captcha info from page
    const captchaInfo = await this.page.evaluate(() => {
      // Check for reCAPTCHA
      const recaptchaDiv = document.querySelector('.g-recaptcha, [data-sitekey]');
      if (recaptchaDiv) {
        return {
          type: 'recaptcha',
          sitekey: recaptchaDiv.getAttribute('data-sitekey'),
          url: window.location.href
        };
      }

      // Check for hCaptcha
      const hcaptchaDiv = document.querySelector('.h-captcha');
      if (hcaptchaDiv) {
        return {
          type: 'hcaptcha',
          sitekey: hcaptchaDiv.getAttribute('data-sitekey'),
          url: window.location.href
        };
      }

      return null;
    });

    if (!captchaInfo) {
      console.log('[Puppeteer] Captcha element found but could not extract info');
      return;
    }

    console.log('[Puppeteer] Solving captcha:', captchaInfo.type);

    // Solve captcha using external service
    const solution = await this.callCaptchaSolver(captchaInfo);

    // Submit solution to page
    await this.page.evaluate((sol: string, type: string) => {
      if (type === 'recaptcha') {
        const textarea = document.querySelector('#g-recaptcha-response') as HTMLTextAreaElement;
        if (textarea) {
          textarea.value = sol;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else if (type === 'hcaptcha') {
        const textarea = document.querySelector('[name="h-captcha-response"]') as HTMLTextAreaElement;
        if (textarea) {
          textarea.value = sol;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }, solution, captchaInfo.type);

    console.log('[Puppeteer] Captcha solution submitted');

    // Wait for page to process
    await this.randomDelay(1000, 2000);
  }

  /**
   * Call external captcha solving service
   */
  private async callCaptchaSolver(captchaInfo: any): Promise<string> {
    const { service, apiKey } = this.options.captchaSolver!;

    if (service === 'anticaptcha') {
      return await this.solveWithAnticaptcha(captchaInfo, apiKey);
    } else if (service === '2captcha') {
      return await this.solveWith2Captcha(captchaInfo, apiKey);
    } else if (service === 'capsolver') {
      return await this.solveWithCapsolver(captchaInfo, apiKey);
    }

    throw new Error(`Unknown captcha service: ${service}`);
  }

  /**
   * Solve with Anti-Captcha
   */
  private async solveWithAnticaptcha(captchaInfo: any, apiKey: string): Promise<string> {
    const endpoint = 'https://api.anti-captcha.com';

    const taskData = {
      clientKey: apiKey,
      task: {
        type: captchaInfo.type === 'recaptcha' ? 'RecaptchaV2TaskProxyless' : 'HCaptchaTaskProxyless',
        websiteURL: captchaInfo.url,
        websiteKey: captchaInfo.sitekey
      }
    };

    const createResponse = await fetch(`${endpoint}/createTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });

    const createResult = await createResponse.json();

    if (createResult.errorId > 0) {
      throw new Error(createResult.errorDescription);
    }

    const taskId = createResult.taskId;

    // Poll for result
    for (let i = 0; i < 60; i++) {
      await this.randomDelay(2000, 3000);

      const response = await fetch(`${endpoint}/getTaskResult`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: apiKey, taskId })
      });

      const result = await response.json();

      if (result.errorId > 0) {
        throw new Error(result.errorDescription);
      }

      if (result.status === 'ready') {
        return result.solution.gRecaptchaResponse || result.solution.token;
      }
    }

    throw new Error('Captcha solving timeout');
  }

  /**
   * Solve with 2Captcha
   */
  private async solveWith2Captcha(captchaInfo: any, apiKey: string): Promise<string> {
    const endpoint = 'https://2captcha.com';
    const method = captchaInfo.type === 'recaptcha' ? 'userrecaptcha' : 'hcaptcha';

    const params = new URLSearchParams({
      key: apiKey,
      method,
      googlekey: captchaInfo.sitekey,
      pageurl: captchaInfo.url,
      json: '1'
    });

    const submitResponse = await fetch(`${endpoint}/in.php?${params}`);
    const submitResult = await submitResponse.json();

    if (submitResult.status !== 1) {
      throw new Error(submitResult.request);
    }

    const captchaId = submitResult.request;

    // Poll for result
    for (let i = 0; i < 60; i++) {
      await this.randomDelay(3000, 4000);

      const checkParams = new URLSearchParams({
        key: apiKey,
        action: 'get',
        id: captchaId,
        json: '1'
      });

      const response = await fetch(`${endpoint}/res.php?${checkParams}`);
      const result = await response.json();

      if (result.status === 1) {
        return result.request;
      }

      if (result.request !== 'CAPCHA_NOT_READY') {
        throw new Error(result.request);
      }
    }

    throw new Error('Captcha solving timeout');
  }

  /**
   * Solve with CapSolver
   */
  private async solveWithCapsolver(captchaInfo: any, apiKey: string): Promise<string> {
    const endpoint = 'https://api.capsolver.com';

    const taskData = {
      clientKey: apiKey,
      task: {
        type: captchaInfo.type === 'recaptcha' ? 'ReCaptchaV2TaskProxyLess' : 'HCaptchaTaskProxyLess',
        websiteURL: captchaInfo.url,
        websiteKey: captchaInfo.sitekey
      }
    };

    const createResponse = await fetch(`${endpoint}/createTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });

    const createResult = await createResponse.json();

    if (createResult.errorId) {
      throw new Error(createResult.errorDescription);
    }

    const taskId = createResult.taskId;

    // Poll for result
    for (let i = 0; i < 60; i++) {
      await this.randomDelay(2000, 3000);

      const response = await fetch(`${endpoint}/getTaskResult`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: apiKey, taskId })
      });

      const result = await response.json();

      if (result.errorId) {
        throw new Error(result.errorDescription);
      }

      if (result.status === 'ready') {
        return result.solution.gRecaptchaResponse || result.solution.token;
      }
    }

    throw new Error('Captcha solving timeout');
  }

  /**
   * Scroll page to trigger lazy loading
   */
  private async scrollToLoadAll(): Promise<void> {
    if (!this.page) return;

    console.log('[Puppeteer] Scrolling to load all products...');

    let previousHeight = 0;
    let currentHeight = await this.page.evaluate(() => document.body.scrollHeight);

    while (currentHeight > previousHeight) {
      previousHeight = currentHeight;

      // Scroll down in steps (more human-like)
      for (let i = 0; i < 3; i++) {
        await this.page.evaluate((step: number) => {
          window.scrollBy(0, window.innerHeight / 3 * step);
        }, i + 1);
        await this.randomDelay(300, 800);
      }

      // Wait for new content to load
      await this.randomDelay(1000, 2000);

      currentHeight = await this.page.evaluate(() => document.body.scrollHeight);

      // Safety limit - max 20 scrolls
      if (currentHeight / 1000 > 20) break;
    }

    console.log('[Puppeteer] Finished scrolling');
  }

  /**
   * Extract listings from page data
   */
  private async extractListingsFromPageData(): Promise<DepopListing[]> {
    if (!this.page) return [];

    const listings = await this.page.evaluate(() => {
      // Try to extract from __NEXT_DATA__
      const nextDataEl = document.getElementById('__NEXT_DATA__');
      if (!nextDataEl) {
        console.warn('[Page] __NEXT_DATA__ not found');
        return [];
      }

      try {
        const data = JSON.parse(nextDataEl.textContent || '');

        // Try multiple possible locations
        let products = data?.props?.pageProps?.products ||
                      data?.props?.pageProps?.shop?.products ||
                      data?.props?.pageProps?.initialReduxState?.products?.products ||
                      Object.values(data?.props?.pageProps?.initialReduxState?.entities?.products || {});

        if (!Array.isArray(products) || products.length === 0) {
          console.warn('[Page] No products found in __NEXT_DATA__');
          return [];
        }

        return products.map((p: any) => ({
          id: p.id || p.slug,
          title: p.name || p.title || p.description,
          price: p.price?.priceAmount || p.price || 0,
          description: p.description,
          images: p.pictures?.map((pic: any) => pic.url || pic) || [],
          brand: p.brandName || p.brand,
          size: p.size,
          condition: p.condition,
          category: p.categories?.[0] || p.category,
          sold: p.sold || p.status === 'sold',
          url: `https://www.depop.com/products/${p.slug || p.id}`
        }));

      } catch (e) {
        console.error('[Page] Failed to parse __NEXT_DATA__:', (e as Error).message);
        return [];
      }
    });

    return listings;
  }

  /**
   * Random delay to appear human
   */
  private async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
