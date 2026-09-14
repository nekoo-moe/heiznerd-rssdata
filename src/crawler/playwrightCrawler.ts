import { Browser, chromium, Page } from "playwright";
import { config } from "../config/env";
import { logger } from "../utils/logger";

export class PlaywrightCrawler {
  private browser: Browser | null = null;

  public async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      logger.crawler("Launching Playwright Chromium headless instance...");
      this.browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
    }
    return this.browser;
  }

  public async createPage(): Promise<Page> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
      locale: "vi-VN",
    });

    const page = await context.newPage();
    return page;
  }

  /**
   * Navigates to Cuutruyen with Playwright to verify accessibility and bypass Cloudflare if needed.
   */
  public async verifyAccess(): Promise<boolean> {
    let page: Page | null = null;
    try {
      logger.crawler("Testing Cuutruyen access via Playwright browser...");
      page = await this.createPage();
      const response = await page.goto(config.cuutruyen.baseUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      const title = await page.title();
      logger.crawler(`Playwright loaded page title: "${title}" (Status: ${response?.status()})`);
      return response ? response.status() < 400 : false;
    } catch (error) {
      logger.error("Playwright failed to load Cuutruyen:", error);
      return false;
    } finally {
      if (page) {
        await page.context().close();
      }
    }
  }

  /**
   * Scrapes recently updated mangas directly from page DOM using Playwright.
   */
  public async scrapeRecentMangas(limit: number = 10): Promise<any[]> {
    let page: Page | null = null;
    try {
      logger.crawler("Scraping recently updated mangas with Playwright browser...");
      page = await this.createPage();
      await page.goto(config.cuutruyen.baseUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      const mangas = await page.evaluate(() => {
        const results: any[] = [];
        const links = document.querySelectorAll('a[href*="/mangas/"]');
        links.forEach((a: Element) => {
          const href = a.getAttribute("href") || "";
          const match = href.match(/\/mangas\/(\d+)/);
          if (match) {
            const id = parseInt(match[1], 10);
            const text = (a.textContent || "").trim();
            if (text && !results.some((r) => r.id === id)) {
              results.push({
                id,
                name: text,
              });
            }
          }
        });
        return results;
      });

      logger.crawler(`Playwright DOM extraction found ${mangas.length} mangas.`);
      return mangas.slice(0, limit);
    } catch (error) {
      logger.error("Playwright error during scrapeRecentMangas:", error);
      return [];
    } finally {
      if (page) {
        await page.context().close();
      }
    }
  }

  public async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.crawler("Playwright browser closed.");
    }
  }
}

export const playwrightCrawler = new PlaywrightCrawler();
