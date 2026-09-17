/**
 * src/anime/animevietsubScraper.ts
 * Playwright-based scraper for AnimeVietsub with FlareSolverr Turnstile bypass,
 * Geo-IP quiz automation, latest release extraction, search query support,
 * and automated domain failover.
 */

import { Page } from "playwright";
import { playwrightCrawler, PlaywrightCrawler } from "../crawler/playwrightCrawler";
import { animevietsubDomainResolver } from "./domainResolver";
import { animevietsubSessionManager, AnimevietsubSessionManager } from "./cookieSession";
import {
  AnimeDetailData,
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
  private sessionManager: AnimevietsubSessionManager;
  private options: Required<AnimevietsubScraperOptions>;

  constructor(
    domainResolver?: IAnimevietsubDomainResolver,
    crawler?: PlaywrightCrawler,
    sessionManager?: AnimevietsubSessionManager,
    options?: AnimevietsubScraperOptions
  ) {
    this.domainResolver = domainResolver ?? animevietsubDomainResolver;
    this.crawler = crawler ?? playwrightCrawler;
    this.sessionManager = sessionManager ?? animevietsubSessionManager;
    this.options = {
      timeoutMs: options?.timeoutMs ?? 30000,
      selectorTimeoutMs: options?.selectorTimeoutMs ?? 10000,
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
   * Primary target: /anime-moi/
   * Secondary fallback: / (homepage)
   *
   * @param limit Maximum number of episode items to return (default: 10)
   * @returns Array of validated AnimeEpisodeItem objects
   */
  public async getLatestEpisodes(limit: number = 10): Promise<AnimeEpisodeItem[]> {
    return this.executeWithFailover(async (baseUrl) => {
      const primaryUrl = `${baseUrl.replace(/\/+$/, "")}/anime-moi/`;
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

      // Deduplicate by animeUrl / episodeUrl to prevent duplicate cards
      const seenUrls = new Set<string>();
      const uniqueEpisodes: AnimeEpisodeItem[] = [];

      for (const ep of episodes) {
        if (!seenUrls.has(ep.episodeUrl)) {
          seenUrls.add(ep.episodeUrl);
          uniqueEpisodes.push(ep);
        }
      }

      logger.crawler(`[AnimeVietsub] Scraped ${uniqueEpisodes.length} unique episodes (limit: ${limit})`);
      if (uniqueEpisodes.length === 0) {
        throw new Error(`Scraped 0 episodes from ${baseUrl}. Possible layout change or bot block.`);
      }
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
   * Internal browser-based scraping engine using Playwright with session authentication.
   */
  private async scrapeCardsFromUrl(
    targetUrl: string,
    baseUrl: string,
    requireSelector: boolean = true
  ): Promise<AnimeEpisodeItem[]> {
    let page: Page | null = null;
    try {
      const auth = await this.sessionManager.createAuthenticatedPage(baseUrl, this.crawler);
      page = auth.page;

      let response = await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.options.timeoutMs,
      }).catch((e) => {
        logger.warn(`[AnimeVietsub] Navigation warning for ${targetUrl}: ${e.message}`);
        return null;
      });

      // Handle Geo-IP quiz if redirected to xac-minh.php
      if (page.url().includes("xac-minh.php")) {
        await this.sessionManager.handleGeoIpQuizIfNeeded(page, targetUrl);
      }

      // Detect Cloudflare Turnstile / 403 block and refresh session if needed
      const title = await page.title().catch(() => "");
      const snippet = await page.content().catch(() => "").then((h) => h.slice(0, 3000).toLowerCase());
      const isChallenge =
        response?.status() === 403 ||
        title.includes("Just a moment") ||
        title.includes("Attention Required") ||
        title.includes("Xác Minh An Toàn") ||
        snippet.includes("_cf_chl_opt") ||
        snippet.includes("cf-browser-verification") ||
        snippet.includes("turnstile");

      if (isChallenge) {
        logger.warn(`[AnimeVietsub] Cloudflare challenge detected on ${targetUrl}. Refreshing session cookies...`);
        await page.context().close().catch(() => {});
        await this.sessionManager.refreshSession(baseUrl, this.crawler);

        const newAuth = await this.sessionManager.createAuthenticatedPage(baseUrl, this.crawler);
        page = newAuth.page;
        response = await page.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: this.options.timeoutMs,
        }).catch(() => null);

        if (page.url().includes("xac-minh.php")) {
          await this.sessionManager.handleGeoIpQuizIfNeeded(page, targetUrl);
        }
      }

      const httpStatus = response?.status() ?? 0;
      if (httpStatus === 404 || httpStatus >= 500) {
        throw new Error(`HTTP ${httpStatus} error loading ${targetUrl}`);
      }

      // Wait for card elements
      if (requireSelector) {
        try {
          await page.waitForSelector(".TPostMv, article.TPost", {
            timeout: this.options.selectorTimeoutMs,
          });
        } catch {
          await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
          await page.waitForTimeout(1500);
        }
      } else {
        try {
          await page.waitForSelector(".TPostMv, article.TPost", { timeout: 4000 });
        } catch {
          // Empty search results
        }
      }

      // Evaluate cards in the browser DOM
      const rawCards = await page.evaluate((baseOrigin) => {
        let elements = Array.from(document.querySelectorAll(".MovieList .TPostMv, .TPostMv"));
        if (elements.length === 0) {
          elements = Array.from(document.querySelectorAll("article.TPost, .film-item, .anime-card"));
        }

        const seenUrls = new Set<string>();
        const results: any[] = [];

        for (const el of elements) {
          const a =
            (el.tagName.toLowerCase() === "a" ? el : null) ||
            el.querySelector("a[href*='/phim/']") ||
            el.querySelector("a");
          const href = a?.getAttribute("href") || "";
          let animeUrl = "";
          if (href) {
            try {
              animeUrl = new URL(href, baseOrigin).href;
            } catch {
              animeUrl = href;
            }
          }

          if (!animeUrl || seenUrls.has(animeUrl)) {
            continue;
          }
          seenUrls.add(animeUrl);

          // Title extraction
          const titleEl =
            el.querySelector(".Title") ||
            el.querySelector("h2") ||
            el.querySelector("h3") ||
            el.querySelector(".name") ||
            el.querySelector(".anime-card-title");
          let title = titleEl ? titleEl.textContent?.trim() : a?.getAttribute("title") || "";
          title = (title || "").replace(/\s*\(\d{4}\)$/, "").trim();

          // Episode extraction & normalization
          const epEl =
            el.querySelector(".mli-eps") ||
            el.querySelector(".episode") ||
            el.querySelector(".badge-episode") ||
            el.querySelector(".anime-badge") ||
            el.querySelector(".Qlty") ||
            el.querySelector(".ep");
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

          // Poster URL
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

          // Episode watch URL
          const episodeUrl = animeUrl
            ? `${animeUrl.replace(/\/+$/, "")}/xem-phim.html`
            : "";

          // Updated timestamp
          const timeEl =
            el.querySelector(".Date") ||
            el.querySelector(".Time") ||
            el.querySelector(".Year") ||
            el.querySelector(".mli-timeschedule");
          const updatedAt = timeEl ? timeEl.textContent?.trim() : undefined;

          results.push({
            animeTitle: title,
            episodeName: episodeName || "Tập mới",
            episodeUrl,
            animeUrl,
            posterUrl,
            updatedAt,
          });
        }

        return results;
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

  private detailCache = new Map<string, { data: AnimeDetailData; timestamp: number }>();
  private readonly DETAIL_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

  /**
   * Parses AnimeDetailData from raw HTML text.
   */
  private parseDetailFromHtml(html: string, pageUrl: string): AnimeDetailData | null {
    try {
      const baseOrigin = new URL(pageUrl).origin;

      // Title
      const titleMatch = html.match(/<h1[^>]*class="[^"]*Title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      if (!title) return null;

      // Subtitle
      const subTitleMatch = html.match(/<h2[^>]*class="[^"]*SubTitle[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
      const subTitle = subTitleMatch ? subTitleMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      // Poster image
      const posterMatch =
        html.match(/<div[^>]*class="[^"]*Image[^"]*"[^>]*>[\s\S]*?<img[^>]*(?:src|data-src)="([^"]+)"/i) ||
        html.match(/<img[^>]*class="[^"]*attachment-img-mov-md[^"]*"[^>]*(?:src|data-src)="([^"]+)"/i);
      let posterUrl = posterMatch ? posterMatch[1] : "";
      if (posterUrl && !posterUrl.startsWith("http")) {
        try {
          posterUrl = new URL(posterUrl, baseOrigin).href;
        } catch {}
      }

      // Banner image (wide panorama)
      const bannerMatch =
        html.match(/<img[^>]*class="[^"]*TPostBg[^"]*"[^>]*(?:src|data-src)="([^"]+)"/i) ||
        html.match(/<img[^>]*(?:src|data-src)="([^"]+data\/big_banner\/[^"]+)"/i) ||
        html.match(/<img[^>]*(?:src|data-src)="([^"]+data\/banner\/[^"]+)"/i);
      let bannerUrl = bannerMatch ? bannerMatch[1] : "";
      if (bannerUrl && !bannerUrl.startsWith("http")) {
        try {
          bannerUrl = new URL(bannerUrl, baseOrigin).href;
        } catch {}
      }

      // Description (Vietnamese synopsis)
      const descMatch = html.match(/<div[^>]*class="[^"]*Description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const description = descMatch
        ? descMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : "";

      // Genres from breadcrumbs (<ol class="breadcrumb"> or <ul class="breadcrumb">)
      const breadcrumbMatch = html.match(
        /<(?:ol|ul)[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/(?:ol|ul)>/i
      );
      const genres: string[] = [];
      if (breadcrumbMatch) {
        const linkMatches = breadcrumbMatch[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi);
        for (const m of linkMatches) {
          const g = m[1].replace(/<[^>]+>/g, "").trim();
          if (
            g &&
            !["Trang chủ", "Anime bộ", "Anime lẻ"].includes(g) &&
            !g.startsWith("Phim ") &&
            g.toLowerCase() !== title.toLowerCase()
          ) {
            genres.push(g);
          }
        }
      }

      // Rating (e.g. data-percent="79" or data-score="7.9" or 7.9/10)
      const scoreMatch =
        html.match(/data-score="([\d.]+)"/) ||
        html.match(/id="average_score"[^>]*>([\d.]+)</) ||
        html.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
      const rating = scoreMatch ? Math.round(parseFloat(scoreMatch[1]) * 10) : undefined;

      const voteTextMatch = html.match(/(\(Đánh giá[\s\S]*?thành viên\))/i);
      const voteText = voteTextMatch
        ? voteTextMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
        : undefined;

      // Episode Total, Year, Views from .Info
      const timeMatch = html.match(/<span[^>]*class="[^"]*Time[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const episodeTotal = timeMatch ? timeMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

      const dateMatch = html.match(/<span[^>]*class="[^"]*Date[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const year = dateMatch ? dateMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

      const viewMatch = html.match(/<span[^>]*class="[^"]*View[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const views = viewMatch ? viewMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

      // Country / Quốc gia
      const countryMatch =
        html.match(/<strong>Quốc\s*gia:<\/strong>\s*<a[^>]*>([\s\S]*?)<\/a>/i) ||
        html.match(/Quốc\s*gia:[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
      const country = countryMatch ? countryMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

      // Extract specific movie genres from Thể loại block (avoids global menu links)
      const specificGenreMatch = html.match(/<strong>Thể\s*loại:<\/strong>([\s\S]*?)<\/li>/i);
      if (specificGenreMatch) {
        const linkMatches = specificGenreMatch[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi);
        for (const m of linkMatches) {
          const g = m[1].replace(/<[^>]+>/g, "").trim();
          if (
            g &&
            !["Trang chủ", "Anime bộ", "Anime lẻ"].includes(g) &&
            !genres.some((existing) => existing.toLowerCase() === g.toLowerCase())
          ) {
            genres.push(g);
          }
        }
      }

      // Accurate Chinese animation / Donghua detection
      const isChineseAnimation =
        (country ? /trung\s*quốc/i.test(country) : false) ||
        (countryMatch ? /quoc-gia\/cn\//i.test(countryMatch[0]) : false) ||
        genres.some((g) => /cartoon|hoạt\s*hình\s*trung\s*quốc|trung\s*quốc/i.test(g));

      return {
        title,
        subTitle,
        posterUrl,
        bannerUrl: bannerUrl || undefined,
        description: description || undefined,
        genres,
        rating,
        voteText,
        year,
        episodeTotal,
        views,
        country,
        isChineseAnimation,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetches comprehensive anime metadata directly from AnimeVietsub detail page.
   * Uses ultra-fast direct HTTP fetch with saved session cookies (~200ms) and
   * seamlessly falls back to Playwright Chromium if needed.
   */
  public async getAnimeDetails(animeUrl: string): Promise<AnimeDetailData | null> {
    if (!animeUrl || !animeUrl.startsWith("http")) return null;

    const cached = this.detailCache.get(animeUrl);
    if (cached && Date.now() - cached.timestamp < this.DETAIL_CACHE_TTL_MS) {
      return cached.data;
    }

    // Step 1: Fast path using direct HTTP fetch with session cookies
    try {
      const session = this.sessionManager.getSavedSession();
      if (session && session.cookies.length > 0) {
        const cookieHeader = session.cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
        const res = await fetch(animeUrl, {
          headers: {
            "User-Agent": session.userAgent,
            Cookie: cookieHeader,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
          },
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          const html = await res.text();
          if (
            !html.includes("Just a moment") &&
            !html.includes("xac-minh.php") &&
            !html.includes("_cf_chl_opt")
          ) {
            const detail = this.parseDetailFromHtml(html, animeUrl);
            if (detail && detail.title) {
              this.detailCache.set(animeUrl, { data: detail, timestamp: Date.now() });
              return detail;
            }
          }
        }
      }
    } catch (fetchErr: any) {
      logger.debug(`[AnimeVietsub] Fast HTTP detail fetch failed for ${animeUrl}: ${fetchErr?.message}`);
    }

    // Step 2: Fallback to Playwright if fast path fails
    let page: Page | null = null;
    try {
      const baseUrl =
        this.domainResolver.getActiveDomain?.() ||
        (await this.domainResolver.resolveDomain(false));

      const auth = await this.sessionManager.createAuthenticatedPage(baseUrl, this.crawler);
      page = auth.page;

      await page.goto(animeUrl, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      }).catch(() => null);

      if (page.url().includes("xac-minh.php")) {
        await this.sessionManager.handleGeoIpQuizIfNeeded(page, animeUrl);
      }

      let html = await page.content().catch(() => "");
      if (
        html.includes("Just a moment") ||
        html.includes("Attention Required") ||
        html.includes("_cf_chl_opt")
      ) {
        logger.warn(`[AnimeVietsub] Cloudflare challenge on detail page ${animeUrl}. Refreshing session...`);
        await page.context().close().catch(() => {});
        await this.sessionManager.refreshSession(baseUrl, this.crawler);

        const newAuth = await this.sessionManager.createAuthenticatedPage(baseUrl, this.crawler);
        page = newAuth.page;
        await page.goto(animeUrl, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null);
        if (page.url().includes("xac-minh.php")) {
          await this.sessionManager.handleGeoIpQuizIfNeeded(page, animeUrl);
        }
        html = await page.content().catch(() => "");
      }

      const detail = this.parseDetailFromHtml(html, animeUrl);

      if (detail && detail.title) {
        this.detailCache.set(animeUrl, { data: detail, timestamp: Date.now() });
        return detail;
      }
      return null;
    } catch (err: any) {
      logger.warn(`[AnimeVietsub] Failed to fetch details for ${animeUrl}: ${err?.message || err}`);
      return null;
    } finally {
      if (page) {
        await page.context().close().catch(() => {});
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
