/**
 * src/ln/hakoScraper.ts
 * Scraper for Cổng Light Novel (Hako / Docln) with FlareSolverr bypass & cookie caching.
 */

import { SettingsRepository } from "../database/repositories/settingsRepo";
import { logger } from "../utils/logger";
import { LnChapterItem, LnDetailData, LnSearchResult } from "./types";

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || "http://localhost:8191/v1";
const HAKO_BASE_URL = "https://ln.hako.vn";
const SETTINGS_HAKO_COOKIES = "hako_cookies";
const SETTINGS_HAKO_UA = "hako_user_agent";

export class HakoScraper {
  private static instance: HakoScraper;
  private memoryCache = new Map<string, { data: any; expiresAt: number }>();

  public static getInstance(): HakoScraper {
    if (!HakoScraper.instance) {
      HakoScraper.instance = new HakoScraper();
    }
    return HakoScraper.instance;
  }

  /**
   * Performs an HTTP GET request with FlareSolverr fallback.
   */
  private async fetchHtml(url: string): Promise<string> {
    // 1. Try fast path with saved cookies
    try {
      const savedCookies = SettingsRepository.get(SETTINGS_HAKO_COOKIES);
      const savedUA = SettingsRepository.get(SETTINGS_HAKO_UA);

      if (savedCookies && savedUA) {
        const cookies: any[] = JSON.parse(savedCookies);
        const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

        const res = await fetch(url, {
          headers: {
            "User-Agent": savedUA,
            Cookie: cookieHeader,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
          },
          signal: AbortSignal.timeout(6000),
        });

        if (res.ok) {
          const html = await res.text();
          if (!html.includes("cf-mitigated") && !html.includes("challenges.cloudflare.com")) {
            return html;
          }
        }
      }
    } catch {
      // Fallback to FlareSolverr
    }

    // 2. Call FlareSolverr
    logger.crawler(`[Hako] Fetching via FlareSolverr: ${url}`);
    const flareRes = await fetch(FLARESOLVERR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cmd: "request.get",
        url,
        maxTimeout: 30000,
      }),
      signal: AbortSignal.timeout(35000),
    });

    if (!flareRes.ok) {
      throw new Error(`FlareSolverr returned HTTP ${flareRes.status} for ${url}`);
    }

    const data = (await flareRes.json()) as any;
    if (data.status !== "ok" || !data.solution?.response) {
      throw new Error(`FlareSolverr failed to solve challenge: ${data.message}`);
    }

    // Save cookies for future fast path
    if (data.solution.cookies && data.solution.userAgent) {
      SettingsRepository.set(SETTINGS_HAKO_COOKIES, JSON.stringify(data.solution.cookies));
      SettingsRepository.set(SETTINGS_HAKO_UA, data.solution.userAgent);
    }

    return data.solution.response;
  }

  /**
   * Scrapes latest updated Light Novel chapters from Hako homepage.
   */
  public async getLatestChapters(limit: number = 18): Promise<LnChapterItem[]> {
    const cacheKey = "hako_latest";
    const cached = this.memoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      const html = await this.fetchHtml(HAKO_BASE_URL);
      const results: LnChapterItem[] = [];

      // Look inside translation chapters section, or fallback to thumb-item-flow
      const translationMatch = html.match(
        /<section[^>]*class="[^"]*last-chapter translation[^"]*"[^>]*>([\s\S]*?)<\/section>/i
      );
      const searchBlock = translationMatch ? translationMatch[1] : html;

      const itemRegex = /<div class="thumb-item-flow[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
      let match: RegExpExecArray | null;

      while ((match = itemRegex.exec(searchBlock)) !== null && results.length < limit) {
        const itemHtml = match[1];

        // Chapter link & title
        const chLinkMatch = itemHtml.match(
          /<a[^>]*href="(\/(?:truyen|sang-tac)[^"]+)"[^>]*title="([^"]*)"/i
        );
        if (!chLinkMatch) continue;

        const rawChUrl = chLinkMatch[1];
        const chapterTitle = chLinkMatch[2] || "Chương mới";
        const chapterUrl = rawChUrl.startsWith("http")
          ? rawChUrl
          : `${HAKO_BASE_URL}${rawChUrl}`;

        // Series URL from chapter URL (e.g. /truyen/26204-slug/c628461-chap-slug -> /truyen/26204-slug)
        let seriesUrl = chapterUrl;
        const seriesUrlMatch = rawChUrl.match(/^(\/(?:truyen|sang-tac)\/[^/]+)/);
        if (seriesUrlMatch) {
          seriesUrl = `${HAKO_BASE_URL}${seriesUrlMatch[1]}`;
        }

        // Volume / Series title
        const volTitleMatch = itemHtml.match(
          /<div class="thumb_attr volume-title">([\s\S]*?)<\/div>/i
        );
        const volumeTitle = volTitleMatch ? volTitleMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

        // Series title from tooltip or volume
        const seriesTitleMatch = itemHtml.match(
          /<div class="thumb_attr series-title">([\s\S]*?)<\/div>/i
        );
        let seriesTitle = seriesTitleMatch
          ? seriesTitleMatch[1].replace(/<[^>]+>/g, "").trim()
          : "";

        if (!seriesTitle && this.memoryCache.has(seriesUrl)) {
          const cached = this.memoryCache.get(seriesUrl);
          if (cached?.data?.title) {
            seriesTitle = cached.data.title;
          }
        }

        if (!seriesTitle) {
          // Derive fallback title from slug: e.g. /truyen/28292-toi-cua-the-gioi-...
          const slugPart = seriesUrl.split("/").pop() || "";
          const cleanSlug = slugPart.replace(/^\d+-/, "").replace(/-/g, " ").trim();
          if (cleanSlug) {
            seriesTitle = cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1);
          } else {
            seriesTitle = "Light Novel";
          }
        }

        // Cover URL
        const bgMatch = itemHtml.match(/data-bg="([^"]+)"/i) ||
          itemHtml.match(/src="([^"]+)"/i) ||
          itemHtml.match(/data-src="([^"]+)"/i);
        const coverUrl = bgMatch ? bgMatch[1] : undefined;

        results.push({
          seriesTitle,
          volumeTitle,
          chapterTitle,
          chapterUrl,
          seriesUrl,
          coverUrl,
          updatedAt: new Date().toISOString(),
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
      logger.error("[Hako] Error fetching latest chapters:", error);
      return [];
    }
  }

  /**
   * Searches Light Novels on Hako by keyword.
   */
  public async searchNovel(keyword: string, limit: number = 10): Promise<LnSearchResult[]> {
    const cleanKey = keyword.trim();
    if (!cleanKey) return [];

    const url = `${HAKO_BASE_URL}/tim-kiem?keywords=${encodeURIComponent(cleanKey)}`;
    try {
      const html = await this.fetchHtml(url);
      const results: LnSearchResult[] = [];

      const itemRegex = /<div class="thumb-item-flow[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
      let match: RegExpExecArray | null;

      while ((match = itemRegex.exec(html)) !== null && results.length < limit) {
        const itemHtml = match[1];

        // Find series link
        const seriesLinkMatch = itemHtml.match(
          /<a[^>]*href="(\/(?:truyen|sang-tac)\/[^"/]+)"[^>]*title="([^"]*)"/i
        );

        // Or chapter link
        const anyLinkMatch = itemHtml.match(
          /<a[^>]*href="(\/(?:truyen|sang-tac)\/[^"]+)"[^>]*title="([^"]*)"/i
        );

        const linkMatch = seriesLinkMatch || anyLinkMatch;
        if (!linkMatch) continue;

        let seriesUrl = linkMatch[1];
        const seriesUrlMatch = seriesUrl.match(/^(\/(?:truyen|sang-tac)\/[^/]+)/);
        if (seriesUrlMatch) {
          seriesUrl = `${HAKO_BASE_URL}${seriesUrlMatch[1]}`;
        } else if (!seriesUrl.startsWith("http")) {
          seriesUrl = `${HAKO_BASE_URL}${seriesUrl}`;
        }

        const title = linkMatch[2] || "Light Novel";

        // Cover URL
        const bgMatch = itemHtml.match(/data-bg="([^"]+)"/i) ||
          itemHtml.match(/src="([^"]+)"/i) ||
          itemHtml.match(/data-src="([^"]+)"/i);
        const coverUrl = bgMatch ? bgMatch[1] : undefined;

        // Latest chapter
        const chTitleMatch = itemHtml.match(
          /<div class="thumb_attr chapter-title"[^>]*>([\s\S]*?)<\/div>/i
        );
        const latestChapter = chTitleMatch
          ? chTitleMatch[1].replace(/<[^>]+>/g, "").trim()
          : undefined;

        results.push({
          title,
          seriesUrl,
          coverUrl,
          latestChapter,
        });
      }

      return results;
    } catch (error) {
      logger.error(`[Hako] Search failed for "${keyword}":`, error);
      return [];
    }
  }

  /**
   * Retrieves full metadata for a Light Novel series.
   */
  public async getNovelDetails(seriesUrl: string): Promise<LnDetailData | null> {
    if (!seriesUrl) return null;

    let cleanUrl = seriesUrl;
    if (!cleanUrl.startsWith("http")) {
      cleanUrl = `${HAKO_BASE_URL}${cleanUrl.startsWith("/") ? "" : "/"}${cleanUrl}`;
    }

    const cached = this.memoryCache.get(cleanUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      const html = await this.fetchHtml(cleanUrl);

      // 1. Title
      const titleMatch = html.match(/<span class="series-name">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ||
        html.match(/<span class="series-name">([^<]+)<\/span>/i) ||
        html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = titleMatch
        ? titleMatch[1].replace(/ - (?:Cổng Light Novel|Đọc Light Novel).*$/i, "").trim()
        : "Light Novel";

      // 2. Cover image
      const coverMatch = html.match(/class="[^"]*content img-in-ratio[^"]*"[^>]*style="[^"]*url\('?([^'\)"]+)'?\)/i) ||
        html.match(/class="series-cover"[^>]*>[\s\S]*?<div class="[^"]*img-in-ratio[^"]*"[^>]*data-bg="([^"]+)"/i) ||
        html.match(/<meta property="og:image" content="([^"]+)"/i);
      const coverUrl = coverMatch ? coverMatch[1] : undefined;

      // 3. Genres / Tags
      const genres = [...html.matchAll(/class="series-gerne-item[^"]*"[^>]*>([^<]+)<\/a>/gi)].map((m) =>
        m[1].trim()
      );

      // 4. Summary
      const summaryMatch = html.match(/<div class="summary-content">([\s\S]*?)<\/div>/i);
      const description = summaryMatch
        ? summaryMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : undefined;

      // 5. Author, Translator, Status, Word Count, Rating, Views
      let author: string | undefined;
      let illustrator: string | undefined;
      let translator: string | undefined;
      let status: string | undefined;
      let wordCount: string | undefined;
      let rating: string | undefined;
      let views: string | undefined;

      const lines = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, "\n")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/Tình trạng:/i.test(line) && i + 1 < lines.length) {
          status = lines[i + 1];
        } else if (/Số từ/i.test(line) && i + 1 < lines.length) {
          wordCount = lines[i + 1];
        } else if (/Đánh giá/i.test(line) && i + 1 < lines.length && /[\d,.]+/.test(lines[i + 1])) {
          const score = lines[i + 1].split("/")[0].trim();
          rating = `${score}/5`;
        } else if (/Lượt xem/i.test(line) && i + 1 < lines.length) {
          views = lines[i + 1];
        } else if (/Nhóm dịch/i.test(line) && i + 1 < lines.length) {
          translator = lines[i + 1];
        } else if (/Tác giả:/i.test(line) && i + 1 < lines.length) {
          author = lines[i + 1];
        } else if (/Họa sĩ:/i.test(line) && i + 1 < lines.length) {
          illustrator = lines[i + 1];
        }
      }

      const result: LnDetailData = {
        title,
        coverUrl,
        author,
        illustrator,
        translator,
        description,
        genres,
        rating,
        views,
        wordCount,
        status,
        seriesUrl: cleanUrl,
      };

      this.memoryCache.set(cleanUrl, {
        data: result,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 min cache
      });

      return result;
    } catch (error) {
      logger.error(`[Hako] Failed to get novel details for ${seriesUrl}:`, error);
      return null;
    }
  }
}

export const hakoScraper = HakoScraper.getInstance();

