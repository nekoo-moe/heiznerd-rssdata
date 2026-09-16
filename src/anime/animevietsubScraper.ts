/**
 * src/anime/animevietsubScraper.ts
 * Playwright-based scraper for AnimeVietsub with Cloudflare bypass,
 * latest release extraction, search query support, and automated domain failover.
 */

import { Page } from "playwright";
import { playwrightCrawler, PlaywrightCrawler } from "../crawler/playwrightCrawler";
import { animevietsubDomainResolver } from "./domainResolver";
import {
  AnimeEpisodeItem,
  AnimeSearchResult,
  AnimevietsubScraperOptions,
  IAnimevietsubDomainResolver,
  IAnimevietsubScraper,
} from "./types";
import { logger } from "../utils/logger";

export class AnimevietsubScraperError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "AnimevietsubScraperError";
  }
}

export class AnimevietsubScraper implements IAnimevietsubScraper {
  private domainResolver: IAnimevietsubDomainResolver;
  private crawler: PlaywrightCrawler;
  private options: Required<AnimevietsubScraperOptions>;

  constructor(
    domainResolver?: IAnimevietsubDomainResolver,
    crawler?: PlaywrightCrawler,
    options?: AnimevietsubScraperOptions
  ) {
    this.domainResolver = domainResolver ?? animevietsubDomainResolver;
    this.crawler = crawler ?? playwrightCrawler;
    this.options = {
      timeoutMs: options?.timeoutMs ?? 30000,
      selectorTimeoutMs: options?.selectorTimeoutMs ?? 15000,
      maxRetries: options?.maxRetries ?? 1,
    };
  }

  /**
   * Returns current active base URL.
   */
  public async getActiveBaseUrl(): Promise<string> {
    return (
      this.domainResolver.getActiveDomain?.() ||
      (await this.domainResolver.resolveDomain(false))
    );
  }

  /**
   * Scrapes the most recently updated anime episodes from AnimeVietsub.
   * Primary target: /danh-sach/phim-moi-cap-nhat/
   * Secondary fallback: / (homepage)
   *
   * @param limit Maximum number of episode items to return (default: 10)
   * @returns Array of validated AnimeEpisodeItem objects
   */
  public async getLatestEpisodes(limit: number = 10): Promise<AnimeEpisodeItem[]> {
    return this.executeWithFailover(async (baseUrl) => {
      const primaryUrl = `${baseUrl.replace(/\/+$/, "")}/danh-sach/phim-moi-cap-nhat/`;
      logger.crawler(`[AnimeVietsub] Fetching latest episodes from: ${primaryUrl}`);

      let episodes: AnimeEpisodeItem[] = [];
      try {
        episodes = await this.scrapeCardsFromUrl(primaryUrl, baseUrl);
      } catch (err: any) {
        logger.warn(`[AnimeVietsub] Primary list page failed (${err.message}). Trying homepage fallback...`);
      }

      // Fallback to homepage if chronological page failed or returned 0 cards
      if (!episodes || episodes.length === 0) {
        const homeUrl = `${baseUrl.replace(/\/+$/, "")}/`;
        logger.crawler(`[AnimeVietsub] Falling back to homepage: ${homeUrl}`);
        episodes = await this.scrapeCardsFromUrl(homeUrl, baseUrl);
      }

      // Deduplicate by episodeUrl to prevent duplicate cards
      const seenUrls = new Set<string>();
      const uniqueEpisodes: AnimeEpisodeItem[] = [];

      for (const ep of episodes) {
        if (!seenUrls.has(ep.episodeUrl)) {
          seenUrls.add(ep.episodeUrl);
          uniqueEpisodes.push(ep);
        }
      }

      logger.crawler(`[AnimeVietsub] Scraped ${uniqueEpisodes.length} unique episodes (limit: ${limit})`);
      return uniqueEpisodes.slice(0, limit);
    });
  }

  /**
   * Searches for anime on AnimeVietsub by query string.
   * Endpoint: /tim-kiem/${encodeURIComponent(query)}/
   *
   * @param query Search keywords
   * @param limit Maximum number of search results to return (default: 10)
   * @returns Array of AnimeSearchResult objects (empty array if no match)
   */
  public async searchAnime(query: string, limit: number = 10): Promise<AnimeSearchResult[]> {
    const trimmed = (query || "").trim();
    if (!trimmed) {
      return [];
    }

    return this.executeWithFailover(async (baseUrl) => {
      const searchUrl = `${baseUrl.replace(/\/+$/, "")}/tim-kiem/${encodeURIComponent(trimmed)}/`;
      logger.crawler(`[AnimeVietsub] Executing search for "${trimmed}" at: ${searchUrl}`);

      const cards = await this.scrapeCardsFromUrl(searchUrl, baseUrl, false);

      const results: AnimeSearchResult[] = cards.map((c) => ({
        title: c.animeTitle,
        url: c.animeUrl,
        animeUrl: c.animeUrl,
        posterUrl: c.posterUrl,
        latestEpisode: c.episodeName,
      }));

      logger.crawler(`[AnimeVietsub] Search "${trimmed}" returned ${results.length} results (limit: ${limit})`);
      return results.slice(0, limit);
    });
  }

  /**
   * Internal browser-based scraping engine using Playwright.
   * Commits navigation, awaits .TPostMv settlement, and evaluates DOM.
   */
  private async scrapeCardsFromUrl(
    targetUrl: string,
    baseUrl: string,
    requireSelector: boolean = true
  ): Promise<AnimeEpisodeItem[]> {
    let page: Page | null = null;
    try {
      page = await this.crawler.createPage();

      const response = await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.options.timeoutMs,
      }).catch((e) => {
        logger.warn(`[AnimeVietsub] Navigation warning for ${targetUrl}: ${e.message}`);
        return null;
      });

      const httpStatus = response?.status() ?? 0;

      // Intercept dead status codes that indicate domain death (404 / 502 / 521)
      if (httpStatus === 404 || httpStatus >= 500) {
        throw new Error(`HTTP ${httpStatus} error loading ${targetUrl}`);
      }

      // Cloudflare interstitial / challenge handling
      let cfSettleMs = 0;
      while (cfSettleMs < 15000) {
        const title = await page.title().catch(() => "");
        const snippet = await page.content().catch(() => "").then((h) => h.slice(0, 3000).toLowerCase());

        if (
          title.includes("Just a moment") ||
          title.includes("Attention Required") ||
          snippet.includes("_cf_chl_opt") ||
          snippet.includes("cf-browser-verification") ||
          snippet.includes("turnstile")
        ) {
          // Attempt to click Turnstile checkbox if visible in iframe
          try {
            const frame = page.frameLocator('iframe[src*="cloudflare"], iframe[src*="turnstile"]');
            const checkbox = frame.locator('input[type="checkbox"], .ctp-checkbox-label, #challenge-stage');
            if (await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
              await checkbox.click().catch(() => {});
            }
          } catch {
            // Ignore click attempt
          }

          await page.waitForTimeout(1500);
          cfSettleMs += 1500;
          continue;
        }
        break;
      }

      // Wait for card containers to appear
      if (requireSelector) {
        try {
          await page.waitForSelector(".TPostMv, a[href*='/phim/']", {
            timeout: this.options.selectorTimeoutMs,
          });
        } catch {
          // Scroll down to trigger lazy loading / DOM updates
          await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
          await page.waitForTimeout(2000);
        }
      } else {
        // For search, give brief settlement period
        try {
          await page.waitForSelector(".TPostMv, a[href*='/phim/']", { timeout: 4000 });
        } catch {
          // No cards found, search may have returned 0 results
        }
      }

      // Evaluate cards in the browser DOM
      const rawCards = await page.evaluate((baseOrigin) => {
        let elements = Array.from(document.querySelectorAll(".TPostMv, .TPost, article.post, .film-item"));
        
        // Fallback: if no dedicated card wrapper, select all links pointing to /phim/
        if (elements.length === 0) {
          elements = Array.from(document.querySelectorAll("a[href*='/phim/']")).filter((a) => {
            return a.querySelector("img") !== null;
          });
        }

        return elements.map((el) => {
          // 1. Link & Anime URL
          const isAnchor = el.tagName.toLowerCase() === "a";
          const a = isAnchor ? el : el.querySelector('a[href*="/phim/"]');
          const href = a?.getAttribute("href") || "";
          let animeUrl = "";
          if (href) {
            try {
              animeUrl = new URL(href, baseOrigin).href;
            } catch {
              animeUrl = href;
            }
          }

          // 2. Title extraction with year stripping
          const titleEl = el.querySelector(".Title") || el.querySelector("h2") || el.querySelector("h3") || el.querySelector(".name");
          let title = titleEl ? titleEl.textContent?.trim() : a?.getAttribute("title") || "";
          title = (title || "").replace(/\s*\(\d{4}\)$/, "").trim();

          // 3. Episode extraction & normalization
          const epEl = el.querySelector(".mli-eps") || el.querySelector(".episode") || el.querySelector(".Qlty") || el.querySelector(".ep");
          const rawEp = epEl ? epEl.textContent?.trim() : "";
          let episodeName = rawEp;
          const numMatch = rawEp?.match(/(\d+)/);
          if (rawEp && /tập|ep/i.test(rawEp) && numMatch) {
            episodeName = `Tập ${numMatch[1]}`;
          } else if (rawEp && /^\d+$/.test(rawEp.trim())) {
            episodeName = `Tập ${rawEp.trim()}`;
          } else if (rawEp && /hoàn\s*tất/i.test(rawEp)) {
            episodeName = "Hoàn tất";
          }

          // 4. Poster image URL
          const img = el.querySelector("img");
          const src =
            img?.getAttribute("src") ||
            img?.getAttribute("data-src") ||
            img?.getAttribute("data-original") ||
            "";
          let posterUrl = "";
          if (src) {
            try {
              posterUrl = new URL(src, baseOrigin).href;
            } catch {
              posterUrl = src;
            }
          }
          if (!posterUrl || !posterUrl.startsWith("http")) {
            posterUrl = `${baseOrigin}/favicon.ico`;
          }

          // 5. Episode watch URL
          let episodeUrl = "";
          if (animeUrl) {
            episodeUrl = animeUrl.endsWith("/") ? `${animeUrl}xem-phim.html` : `${animeUrl}/xem-phim.html`;
          }

          // 6. Updated time / metadata
          const timeEl =
            el.querySelector(".Date") ||
            el.querySelector(".Time") ||
            el.querySelector(".Year") ||
            el.querySelector(".mli-timeschedule");
          const updatedAt = timeEl ? timeEl.textContent?.trim() : undefined;

          return {
            animeTitle: title,
            episodeName: episodeName || "Tập mới",
            episodeUrl,
            animeUrl,
            posterUrl,
            updatedAt,
          };
        });
      }, baseUrl);

      // Validate and clean results
      const validCards: AnimeEpisodeItem[] = [];
      for (const card of rawCards) {
        if (card.animeTitle && card.animeUrl && card.episodeUrl) {
          validCards.push({
            animeTitle: card.animeTitle,
            episodeName: card.episodeName,
            episodeUrl: card.episodeUrl,
            animeUrl: card.animeUrl,
            posterUrl: card.posterUrl,
            ...(card.updatedAt ? { updatedAt: card.updatedAt } : {}),
          });
        }
      }

      return validCards;
    } finally {
      if (page) {
        await page.context().close().catch(() => {});
      }
    }
  }

  /**
   * Wraps scraping operations in an automatic failover lifecycle.
   * If an active domain fails, forces a domain probe refresh and retries once.
   */
  private async executeWithFailover<T>(
    operation: (baseUrl: string) => Promise<T>
  ): Promise<T> {
    let baseUrl =
      this.domainResolver.getActiveDomain?.() ||
      (await this.domainResolver.resolveDomain(false));

    try {
      return await operation(baseUrl);
    } catch (primaryError: any) {
      logger.warn(
        `[AnimeVietsub] Scrape operation failed on active domain (${baseUrl}): ${primaryError?.message ?? primaryError}. Triggering domain failover...`
      );

      // Force domain resolver to probe candidate TLDs
      try {
        const newBaseUrl = await this.domainResolver.resolveDomain(true);
        logger.info(`[AnimeVietsub] Domain resolver refreshed to: ${newBaseUrl}. Retrying scrape...`);
        baseUrl = newBaseUrl;
      } catch (resolverError: any) {
        logger.error("[AnimeVietsub] Domain resolver failed to find healthy candidate during failover:", resolverError);
        throw new AnimevietsubScraperError(
          `Scraper failed and domain resolution also failed: ${primaryError?.message}`,
          primaryError
        );
      }

      // Retry operation once on new base URL
      try {
        return await operation(baseUrl);
      } catch (retryError: any) {
        logger.error(`[AnimeVietsub] Scrape retry failed on refreshed domain (${baseUrl}):`, retryError);
        throw new AnimevietsubScraperError(
          `Scraper retry failed on domain ${baseUrl}: ${retryError?.message}`,
          retryError
        );
      }
    }
  }

  /**
   * Closes the underlying Playwright Chromium instance.
   */
  public async close(): Promise<void> {
    await this.crawler.close();
  }
}

export const animevietsubScraper = new AnimevietsubScraper();
