/**
 * src/manhwa/truyenqqScraper.ts
 * High-performance scraper for Manhwa (TruyenQQ) with dedicated Korean manhwa category,
 * transparent auto domain rotation, and redirect recovery.
 */

import { logger } from "../utils/logger";
import { truyenqqDomainResolver } from "./domainResolver";
import { ManhwaChapterItem, ManhwaDetailData, ManhwaSearchResult } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export class TruyenqqScraper {
  private static instance: TruyenqqScraper;
  private memoryCache = new Map<string, { data: any; expiresAt: number }>();

  public static getInstance(): TruyenqqScraper {
    if (!TruyenqqScraper.instance) {
      TruyenqqScraper.instance = new TruyenqqScraper();
    }
    return TruyenqqScraper.instance;
  }

  private getBaseUrl(): string {
    return truyenqqDomainResolver.getActiveDomain();
  }

  /**
   * Safe fetch with automatic HTTP redirect interception and domain auto-rotation retry.
   */
  private async safeFetch(
    pathOrUrl: string,
    options: RequestInit = {},
    retries: number = 1
  ): Promise<{ res: Response; html: string }> {
    const baseUrl = this.getBaseUrl();
    let url = pathOrUrl;

    if (!url.startsWith("http")) {
      url = `${baseUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
    } else {
      try {
        const parsed = new URL(url);
        // Align request origin to current activeDomain if different
        url = `${baseUrl}${parsed.pathname}${parsed.search}`;
      } catch {
        // keep url as is
      }
    }

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
          ...options.headers,
        },
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
        ...options,
      });

      if (res.url) {
        truyenqqDomainResolver.handleRedirect(res.url);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const html = await res.text();
      return { res, html };
    } catch (err: any) {
      if (retries > 0) {
        logger.warn(
          `[TruyenQQ] Fetch failed on "${baseUrl}" (${err.message}). Probing candidate domains for auto-rotation...`
        );
        const newDomain = await truyenqqDomainResolver.resolveDomain(true);
        logger.info(`[TruyenQQ] Retrying request on resolved domain: ${newDomain}`);
        return this.safeFetch(pathOrUrl, options, retries - 1);
      }
      throw err;
    }
  }

  /**
   * Scrapes latest updated Manhwa from TruyenQQ category (country=3: Hàn Quốc, sort=2: cập nhật giảm dần).
   */
  public async getLatestManhwa(limit: number = 20): Promise<ManhwaChapterItem[]> {
    const cacheKey = "truyenqq_latest";
    const cached = this.memoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      const { html } = await this.safeFetch("/the-loai/manhwa-49?country=3&sort=2");
      const baseUrl = this.getBaseUrl();
      const results: ManhwaChapterItem[] = [];

      // Parse list items
      const itemBlocks = html.split('<ul class="list_grid grid">')[1]?.split("</ul>")[0];
      if (!itemBlocks) return [];

      const items = itemBlocks.split("<li>").slice(1);

      for (const item of items) {
        if (results.length >= limit) break;

        // Title and URL
        const titleMatch = item.match(/<div class="book_name qtip"[^>]*>[\s\S]*?<h3><a[^>]*title="([^"]+)"[^>]*href="([^"]+)"/i);
        if (!titleMatch) continue;

        const manhwaTitle = titleMatch[1].trim();
        const rawManhwaUrl = titleMatch[2].trim();
        const manhwaUrl = rawManhwaUrl.startsWith("http") ? rawManhwaUrl : `${baseUrl}${rawManhwaUrl}`;

        // Cover
        const coverMatch = item.match(/<div class="book_avatar"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i);
        const coverUrl = coverMatch ? coverMatch[1] : undefined;

        // Latest chapter
        const chMatch = item.match(/<div class="last_chapter">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
        if (!chMatch) continue;

        const rawChUrl = chMatch[1].trim();
        const chapterTitle = chMatch[2].trim();
        const chapterUrl = rawChUrl.startsWith("http") ? rawChUrl : `${baseUrl}${rawChUrl}`;

        // Other name
        const otherNameMatch = item.match(/<div class="title-more-other">([^<]+)<\/div>/i);
        let otherName = otherNameMatch ? otherNameMatch[1].replace(/Tên khác:\s*/i, "").trim() : undefined;
        if (
          otherName &&
          (otherName.toLowerCase() === manhwaTitle.toLowerCase() ||
            otherName.replace(/\s+/g, "").toLowerCase() === manhwaTitle.replace(/\s+/g, "").toLowerCase())
        ) {
          otherName = undefined;
        }

        // Updated at
        const timeMatch = item.match(/<span class="time-ago">([^<]+)<\/span>/i);
        const updatedAt = timeMatch ? timeMatch[1].trim() : undefined;

        results.push({
          manhwaTitle,
          otherName,
          chapterTitle,
          chapterUrl,
          manhwaUrl,
          coverUrl,
          updatedAt,
        });
      }

      if (results.length > 0) {
        this.memoryCache.set(cacheKey, {
          data: results,
          expiresAt: Date.now() + 60 * 1000, // 1 min cache
        });
      }

      return results;
    } catch (error) {
      logger.error("[TruyenQQ] Error fetching latest manhwa:", error);
      return [];
    }
  }

  /**
   * Searches Manhwa on TruyenQQ via fast AJAX POST search.
   */
  public async searchManhwa(query: string, limit: number = 10): Promise<ManhwaSearchResult[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    try {
      const formData = new URLSearchParams();
      formData.append("search", cleanQuery);
      formData.append("type", "0");

      const { html } = await this.safeFetch("/frontend/search/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/javascript, */*; q=0.01",
        },
        body: formData.toString(),
      });

      const baseUrl = this.getBaseUrl();
      const json = JSON.parse(html);
      const results: ManhwaSearchResult[] = [];

      if (json && json.status === "success" && Array.isArray(json.data)) {
        for (const item of json.data.slice(0, limit)) {
          const rawUrl = item.url || item.slug || "";
          const manhwaUrl = rawUrl.startsWith("http")
            ? rawUrl
            : `${baseUrl}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
          const title = item.name || item.title || "Manhwa";
          let otherName = item.other_name ? String(item.other_name).trim() : undefined;
          if (
            otherName &&
            (otherName.toLowerCase() === title.toLowerCase() ||
              otherName.replace(/\s+/g, "").toLowerCase() === title.replace(/\s+/g, "").toLowerCase())
          ) {
            otherName = undefined;
          }

          results.push({
            title,
            otherName,
            manhwaUrl,
            coverUrl: item.avatar || item.image,
            latestChapter: item.last_chapter || item.chapter,
          });
        }
      }

      return results;
    } catch (error) {
      logger.error(`[TruyenQQ] Error searching manhwa "${query}":`, error);
      return [];
    }
  }

  /**
   * Gets rich details of a Manhwa series.
   */
  public async getManhwaDetails(manhwaUrl: string): Promise<ManhwaDetailData | null> {
    if (!manhwaUrl) return null;

    const baseUrl = this.getBaseUrl();
    let cleanUrl = manhwaUrl;
    if (!cleanUrl.startsWith("http")) {
      cleanUrl = `${baseUrl}${cleanUrl.startsWith("/") ? "" : "/"}${cleanUrl}`;
    }

    const cached = this.memoryCache.get(cleanUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      const { html } = await this.safeFetch(cleanUrl);

      // Title
      const titleMatch = html.match(/<h1 itemprop="name">([^<]+)<\/h1>/i) ||
        html.match(/<title>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/ - TruyenQQ.*$/i, "").trim() : "Manhwa";

      // Other name
      const otherMatch = html.match(/<p class="other-name[^"]*">([^<]+)<\/p>/i);
      let otherName = otherMatch ? otherMatch[1].trim() : undefined;
      if (
        otherName &&
        (otherName.toLowerCase() === title.toLowerCase() ||
          otherName.replace(/\s+/g, "").toLowerCase() === title.replace(/\s+/g, "").toLowerCase())
      ) {
        otherName = undefined;
      }

      // Cover
      const coverMatch = html.match(/<div class="book_avatar"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i);
      const coverUrl = coverMatch ? coverMatch[1] : undefined;

      // Author
      const authorMatch = html.match(/<li class="author row">[\s\S]*?<p class="col-xs-9">([\s\S]*?)<\/p>/i);
      const author = authorMatch ? authorMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

      // Status
      const statusMatch = html.match(/<li class="status row">[\s\S]*?<p class="col-xs-9">([\s\S]*?)<\/p>/i);
      const status = statusMatch ? statusMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

      // Total chapters
      const chapMatch = html.match(/Tổng số chap[\s\S]*?<p class="col-xs-9">([\s\S]*?)<\/p>/i);
      const totalChapters = chapMatch ? chapMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

      // Followers
      const followMatch = html.match(/Lượt theo dõi[\s\S]*?<p class="col-xs-9">([\s\S]*?)<\/p>/i);
      const followers = followMatch ? followMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

      // Views
      const viewsMatch = html.match(/Lượt xem[\s\S]*?<p class="col-xs-9">([\s\S]*?)<\/p>/i) ||
        html.match(/<i class="fa fa-eye"><\/i>\s*([\d,.]+)/i);
      const views = viewsMatch ? viewsMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

      // Description - clean out automated SEO marketing text
      const descMatch = html.match(/<div class="story-detail-info[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
        html.match(/<div class="detail-content"[^>]*>([\s\S]*?)<\/div>/i);
      let description = descMatch
        ? descMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : undefined;

      if (description) {
        const safeTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const seoRegex = new RegExp(
          `(?:${safeTitle}\\s+l\u00e0\\s+m\u1ed9t\\s+trong\\s+nh\u1eefng\\s+t\u00e1c\\s+ph\u1ea9m|K\u1ec3\\s+t\u1eeb\\s+khi\\s+ra\\s+m\u1eaft|Theo\\s+d\u00f5i\\s+${safeTitle}\\s+tr\u00ean)[\\s\\S]*$`,
          "i"
        );
        const cleaned = description.replace(seoRegex, "").trim();
        if (cleaned.length > 20) {
          description = cleaned;
        }
      }

      // Genres - strictly from story's own list01 category container
      const list01Match = html.match(/<ul class="list01"[^>]*>([\s\S]*?)<\/ul>/i);
      let genres: string[] = [];
      if (list01Match) {
        genres = [...list01Match[1].matchAll(/<a[^>]*>([^<]+)<\/a>/gi)]
          .map((m) => m[1].trim())
          .filter((g) => g && g !== "Trang Chủ" && g !== "Truyện Tranh");
      }
      if (genres.length === 0) {
        genres = ["Manhwa"];
      }

      const uniqueGenres = [...new Set(genres)];

      // Latest Chapter
      const latestChapMatch = html.match(/<div class="col-md-10 col-sm-10 col-xs-8 name-chap">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
      const latestChapter = latestChapMatch ? latestChapMatch[1].trim() : undefined;

      const result: ManhwaDetailData = {
        title,
        otherName,
        coverUrl,
        author,
        status,
        description,
        genres: uniqueGenres,
        views,
        followers,
        totalChapters,
        manhwaUrl: cleanUrl,
        latestChapter,
      };

      this.memoryCache.set(cleanUrl, {
        data: result,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 min cache
      });

      return result;
    } catch (error) {
      logger.error(`[TruyenQQ] Failed to get manhwa details for ${manhwaUrl}:`, error);
      return null;
    }
  }
}

export const truyenqqScraper = TruyenqqScraper.getInstance();
