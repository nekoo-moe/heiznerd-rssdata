/**
 * src/anime/cookieSession.ts
 * Session and cookie management for AnimeVietsub with Cloudflare Turnstile
 * bypass via FlareSolverr and Geo-IP quiz automation.
 */

import { Browser, Page } from "playwright";
import { SettingsRepository } from "../database/repositories/settingsRepo";
import { logger } from "../utils/logger";
import { PlaywrightCrawler, playwrightCrawler } from "../crawler/playwrightCrawler";

export const SETTINGS_COOKIES_KEY = "animevietsub_cookies";
export const SETTINGS_USER_AGENT_KEY = "animevietsub_user_agent";
export const SETTINGS_SESSION_AT_KEY = "animevietsub_session_at";
export const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || "http://localhost:8191/v1";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export interface SessionData {
  cookies: any[];
  userAgent: string;
  updatedAt?: string;
}

export class AnimevietsubSessionManager {
  private static instance: AnimevietsubSessionManager;
  private inFlightRefresh: Promise<SessionData> | null = null;

  public static getInstance(): AnimevietsubSessionManager {
    if (!AnimevietsubSessionManager.instance) {
      AnimevietsubSessionManager.instance = new AnimevietsubSessionManager();
    }
    return AnimevietsubSessionManager.instance;
  }

  /**
   * Retrieves saved session cookies and user agent from SQLite.
   */
  public getSavedSession(): SessionData | null {
    try {
      const rawCookies = SettingsRepository.get(SETTINGS_COOKIES_KEY);
      if (!rawCookies) return null;
      const cookies = JSON.parse(rawCookies);
      if (!Array.isArray(cookies) || cookies.length === 0) return null;
      const userAgent = SettingsRepository.get(SETTINGS_USER_AGENT_KEY) || DEFAULT_USER_AGENT;
      const updatedAt = SettingsRepository.get(SETTINGS_SESSION_AT_KEY) || undefined;
      return { cookies, userAgent, updatedAt };
    } catch (err: any) {
      logger.warn(`[SessionManager] Failed to read saved session from DB: ${err.message}`);
      return null;
    }
  }

  /**
   * Persists session cookies and user agent to SQLite.
   */
  public saveSession(cookies: any[], userAgent: string): void {
    try {
      SettingsRepository.set(SETTINGS_COOKIES_KEY, JSON.stringify(cookies));
      SettingsRepository.set(SETTINGS_USER_AGENT_KEY, userAgent);
      SettingsRepository.set(SETTINGS_SESSION_AT_KEY, new Date().toISOString());
      logger.debug(`[SessionManager] Saved ${cookies.length} session cookies to database.`);
    } catch (err: any) {
      logger.error(`[SessionManager] Failed to save session to DB: ${err.message}`);
    }
  }

  /**
   * Clears saved session from SQLite.
   */
  public clearSession(): void {
    SettingsRepository.delete(SETTINGS_COOKIES_KEY);
    SettingsRepository.delete(SETTINGS_USER_AGENT_KEY);
    SettingsRepository.delete(SETTINGS_SESSION_AT_KEY);
    logger.debug("[SessionManager] Cleared AnimeVietsub session from database.");
  }

  /**
   * Solves Cloudflare challenge via FlareSolverr Docker instance.
   */
  public async solveWithFlareSolverr(targetUrl: string): Promise<{ cookies: any[]; userAgent: string }> {
    logger.crawler(`[SessionManager] Calling FlareSolverr at ${FLARESOLVERR_URL} for ${targetUrl}...`);
    const startTime = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 65000);

    try {
      const res = await fetch(FLARESOLVERR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "request.get",
          url: targetUrl,
          maxTimeout: 60000,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`FlareSolverr HTTP status ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      if (data.status !== "ok" || !data.solution) {
        throw new Error(`FlareSolverr failed: ${data.message || JSON.stringify(data)}`);
      }

      const cookies = data.solution.cookies || [];
      const userAgent = data.solution.userAgent || DEFAULT_USER_AGENT;
      const duration = Date.now() - startTime;
      logger.success(`[SessionManager] FlareSolverr challenge solved in ${duration}ms (${cookies.length} cookies)`);

      return { cookies, userAgent };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Automatically answers Vietnamese Geo-IP quiz if redirected to xac-minh.php.
   */
  public async handleGeoIpQuizIfNeeded(page: Page, targetUrl?: string): Promise<boolean> {
    const currentUrl = page.url();
    if (!currentUrl.includes("xac-minh.php")) {
      return false;
    }

    logger.crawler(`[SessionManager] Detected Geo-IP quiz at ${currentUrl}. Filling verification answers...`);
    try {
      await page.waitForSelector("input[name='ngay_ng']", { timeout: 5000 });
      await page.fill("input[name='ngay_ng']", "20/11");
      await page.fill("input[name='tiente']", "VND");
      await page.fill("input[name='quocky']", "5");
      await page.fill("input[name='quandao']", "Việt Nam");
      await page.fill("input[name='cautho']", "Bác Hồ");

      // Submit form
      await page.click("#btn-submit");
      await page.waitForTimeout(2000);

      const afterUrl = page.url();
      logger.success(`[SessionManager] Geo-IP quiz submitted. New page URL: ${afterUrl}`);

      // If still on xac-minh.php, navigate to target destination
      if (afterUrl.includes("xac-minh.php")) {
        let dest = targetUrl;
        try {
          const refParam = new URL(currentUrl).searchParams.get("ref");
          if (refParam) {
            const decoded = Buffer.from(refParam, "base64").toString("utf-8");
            if (decoded.startsWith("http")) {
              dest = decoded;
            }
          }
        } catch {}

        if (dest && dest.startsWith("http")) {
          logger.crawler(`[SessionManager] Navigating from verification page to destination: ${dest}`);
          await page.goto(dest, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null);
        }
      }

      return true;
    } catch (err: any) {
      logger.warn(`[SessionManager] Error handling Geo-IP quiz: ${err.message}`);
      return false;
    }
  }

  /**
   * Refreshes the session by solving Cloudflare challenge via FlareSolverr
   * and handling Geo-IP quiz if necessary.
   */
  public async refreshSession(
    baseUrl: string,
    crawler: PlaywrightCrawler = playwrightCrawler
  ): Promise<SessionData> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }

    this.inFlightRefresh = this._executeRefresh(baseUrl, crawler).finally(() => {
      this.inFlightRefresh = null;
    });

    return this.inFlightRefresh;
  }

  private async _executeRefresh(
    baseUrl: string,
    crawler: PlaywrightCrawler
  ): Promise<SessionData> {
    logger.crawler(`[SessionManager] Refreshing session for ${baseUrl}...`);
    const targetUrl = `${baseUrl.replace(/\/+$/, "")}/anime-moi/`;

    // Step 1: Solve Cloudflare challenge with FlareSolverr
    let flareResult: { cookies: any[]; userAgent: string };
    try {
      flareResult = await this.solveWithFlareSolverr(targetUrl);
    } catch (err: any) {
      logger.error(`[SessionManager] FlareSolverr failed: ${err.message}`);
      throw err;
    }

    // Step 2: Open Playwright browser with FlareSolverr cookies to solve Geo-IP quiz
    const browser = await crawler.getBrowser();
    const context = await browser.newContext({
      userAgent: flareResult.userAgent,
      viewport: { width: 1920, height: 1080 },
      locale: "vi-VN",
      timezoneId: "Asia/Ho_Chi_Minh",
    });

    try {
      await context.addCookies(
        flareResult.cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: "Lax",
        }))
      );

      const page = await context.newPage();
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1500);

      // Solve Geo-IP quiz if prompted
      await this.handleGeoIpQuizIfNeeded(page, targetUrl);

      // Collect all resulting cookies (including cf_clearance and avs__geoip_confirm)
      const allCookies = await context.cookies();
      this.saveSession(allCookies, flareResult.userAgent);

      return {
        cookies: allCookies,
        userAgent: flareResult.userAgent,
        updatedAt: new Date().toISOString(),
      };
    } finally {
      await context.close().catch(() => {});
    }
  }

  /**
   * Creates a pre-authenticated Playwright page using cached or refreshed session cookies.
   */
  public async createAuthenticatedPage(
    baseUrl: string,
    crawler: PlaywrightCrawler = playwrightCrawler
  ): Promise<{ page: Page; userAgent: string }> {
    let session = this.getSavedSession();

    if (!session) {
      logger.crawler("[SessionManager] No cached session found. Initiating full auth handshake...");
      session = await this.refreshSession(baseUrl, crawler);
    }

    const browser = await crawler.getBrowser();
    const context = await browser.newContext({
      userAgent: session.userAgent,
      viewport: { width: 1920, height: 1080 },
      locale: "vi-VN",
      timezoneId: "Asia/Ho_Chi_Minh",
    });

    // Stealth script
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      (globalThis as any).chrome = { runtime: {} };
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "languages", { get: () => ["vi-VN", "vi", "en-US", "en"] });
    });

    await context.addCookies(session.cookies);
    const page = await context.newPage();

    // Abort heavy resources (images, media, fonts) to conserve RAM/CPU and prevent timeouts
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font"].includes(type)) {
        return route.abort();
      }
      return route.continue();
    });

    return { page, userAgent: session.userAgent };
  }
}

export const animevietsubSessionManager = AnimevietsubSessionManager.getInstance();

