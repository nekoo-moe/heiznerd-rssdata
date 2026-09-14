import { config } from "../config/env";
import { getDatabase } from "../database/db";
import { logger } from "../utils/logger";
import {
  ChapterDetail,
  EnrichedChapterNotification,
  MangaDetail,
  MangaListItem,
  UserAuthResponse,
} from "./types";

export function rewriteStorageUrl(url?: string | null): string {
  if (!url || typeof url !== "string") return "";
  return url
    .replaceAll("storage-ct.lrclib.net", "storage-bravo.cuutruyen.net")
    .replaceAll("storage-ct-riften.site", "storage-charlie.cuutruyen.net");
}

export class CuutruyenClient {
  private baseUrl: string;
  private authToken: string | null = null;
  private userId: number | null = null;

  constructor() {
    this.baseUrl = config.cuutruyen.baseUrl.replace(/\/$/, "");
    this.loadCachedAuth();
  }

  private loadCachedAuth(): void {
    try {
      const db = getDatabase();
      const tokenRow = db
        .prepare("SELECT value FROM bot_settings WHERE key = 'auth_token'")
        .get() as { value: string } | undefined;
      const uidRow = db
        .prepare("SELECT value FROM bot_settings WHERE key = 'user_id'")
        .get() as { value: string } | undefined;

      if (tokenRow && uidRow) {
        this.authToken = tokenRow.value;
        this.userId = parseInt(uidRow.value, 10);
        logger.debug(`Loaded cached Cuutruyen auth for user ID: ${this.userId}`);
      }
    } catch (e) {
      logger.debug("No cached auth found or DB not ready yet");
    }
  }

  private saveAuth(token: string, userId: number): void {
    this.authToken = token;
    this.userId = userId;
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO bot_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `);
      stmt.run("auth_token", token);
      stmt.run("user_id", String(userId));
    } catch (e) {
      logger.warn("Failed to persist auth cache in DB:", e);
    }
  }

  public async login(force: boolean = false): Promise<boolean> {
    if (!force && this.authToken && this.userId) {
      return true;
    }

    const { username, password } = config.cuutruyen;
    if (!username || !password) {
      logger.warn("No Cuutruyen credentials provided in config.");
      return false;
    }

    try {
      logger.crawler(`Logging into Cuutruyen as: ${username}...`);
      const response = await fetch(`${this.baseUrl}/api/v2/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cuutruyen-Client": "OfficialWebApp-20250805",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok && response.status !== 202) {
        throw new Error(`Login failed with HTTP status ${response.status}`);
      }

      const resJson = (await response.json()) as UserAuthResponse;
      if (resJson && resJson.auth_token && resJson.data) {
        this.saveAuth(resJson.auth_token, resJson.data.id);
        logger.success(
          `Logged in Cuutruyen successfully as ${resJson.data.username} (ID: ${resJson.data.id})`
        );
        return true;
      }

      logger.error("Login response did not contain expected auth_token:", resJson);
      return false;
    } catch (error) {
      logger.error("Error logging into Cuutruyen:", error);
      return false;
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Cuutruyen-Client": "OfficialWebApp-20250805",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
    };

    if (this.authToken && this.userId) {
      headers["M4U_UID"] = String(this.userId);
      headers["M4U_TOKEN"] = this.authToken;
    }

    return headers;
  }

  /**
   * Fetches latest chapter updates combining both home_a (new_chapter_mangas)
   * and mangas/recently_updated for real-time accuracy and zero missed updates.
   */
  public async getLatestUpdates(): Promise<MangaListItem[]> {
    try {
      const [homeRes, recentRes] = await Promise.all([
        fetch(`${this.baseUrl}/api/v2/home_a`, { headers: this.getHeaders() }).catch(() => null),
        fetch(`${this.baseUrl}/api/v2/mangas/recently_updated?page=1&per_page=25`, { headers: this.getHeaders() }).catch(() => null),
      ]);

      const items: MangaListItem[] = [];
      const seenChapterIds = new Set<number>();

      if (homeRes && homeRes.ok) {
        const homeJson = (await homeRes.json()) as any;
        const newChapters = homeJson?.data?.new_chapter_mangas || [];
        for (const m of newChapters) {
          if (m.newest_chapter_id && !seenChapterIds.has(m.newest_chapter_id)) {
            seenChapterIds.add(m.newest_chapter_id);
            items.push({
              ...m,
              name: (m.name || "").trim(),
              cover_url: rewriteStorageUrl(m.cover_url),
              cover_mobile_url: rewriteStorageUrl(m.cover_mobile_url),
            });
          }
        }
      }

      if (recentRes && recentRes.ok) {
        const recentJson = (await recentRes.json()) as any;
        const recentList = recentJson?.data || [];
        for (const m of recentList) {
          if (m.newest_chapter_id && !seenChapterIds.has(m.newest_chapter_id)) {
            seenChapterIds.add(m.newest_chapter_id);
            items.push({
              ...m,
              name: (m.name || "").trim(),
              cover_url: rewriteStorageUrl(m.cover_url),
              cover_mobile_url: rewriteStorageUrl(m.cover_mobile_url),
            });
          }
        }
      }

      return items.length > 0 ? items : this.getRecentlyUpdated(1, 25);
    } catch (error) {
      logger.error("Error in getLatestUpdates:", error);
      return this.getRecentlyUpdated(1, 25);
    }
  }

  public async getRecentlyUpdated(page: number = 1, perPage: number = 20): Promise<MangaListItem[]> {
    const url = `${this.baseUrl}/api/v2/mangas/recently_updated?page=${page}&per_page=${perPage}`;
    try {
      const response = await fetch(url, { headers: this.getHeaders() });
      if (response.status === 401 || response.status === 403) {
        // Token might have expired, try re-login
        logger.warn("Received 401/403, attempting to re-authenticate...");
        const reloginSuccess = await this.login(true);
        if (reloginSuccess) {
          const retryRes = await fetch(url, { headers: this.getHeaders() });
          const json = (await retryRes.json()) as any;
          return (json && json.data) || [];
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching recently_updated`);
      }

      const json = (await response.json()) as any;
      const list = (json && json.data) || [];
      return list.map((m: any) => ({
        ...m,
        cover_url: rewriteStorageUrl(m.cover_url),
        cover_mobile_url: rewriteStorageUrl(m.cover_mobile_url),
      }));
    } catch (error) {
      logger.error("Error fetching recently_updated:", error);
      return [];
    }
  }

  public async getFollowing(page: number = 1, perPage: number = 20): Promise<MangaListItem[]> {
    if (!this.authToken) {
      await this.login();
    }

    const url = `${this.baseUrl}/api/v2/mangas/following?page=${page}&per_page=${perPage}`;
    try {
      const response = await fetch(url, { headers: this.getHeaders() });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching following`);
      }
      const json = (await response.json()) as any;
      const list = (json && json.data) || [];
      return list.map((m: any) => ({
        ...m,
        cover_url: rewriteStorageUrl(m.cover_url),
        cover_mobile_url: rewriteStorageUrl(m.cover_mobile_url),
      }));
    } catch (error) {
      logger.error("Error fetching following mangas:", error);
      return [];
    }
  }

  public async getMangaDetail(mangaId: number): Promise<MangaDetail | null> {
    const url = `${this.baseUrl}/api/v2/mangas/${mangaId}`;
    try {
      const response = await fetch(url, { headers: this.getHeaders() });
      if (!response.ok) {
        return null;
      }
      const json = (await response.json()) as any;
      if (json && json.data) {
        json.data.cover_url = rewriteStorageUrl(json.data.cover_url);
        json.data.cover_mobile_url = rewriteStorageUrl(json.data.cover_mobile_url);
        json.data.panorama_url = rewriteStorageUrl(json.data.panorama_url);
        json.data.panorama_mobile_url = rewriteStorageUrl(json.data.panorama_mobile_url);
        return json.data;
      }
      return null;
    } catch (error) {
      logger.error(`Error fetching manga ${mangaId}:`, error);
      return null;
    }
  }

  public async getChapterDetail(chapterId: number): Promise<ChapterDetail | null> {
    const url = `${this.baseUrl}/api/v2/chapters/${chapterId}`;
    try {
      const response = await fetch(url, { headers: this.getHeaders() });
      if (!response.ok) {
        return null;
      }
      const json = (await response.json()) as any;
      return (json && json.data) || null;
    } catch (error) {
      logger.error(`Error fetching chapter ${chapterId}:`, error);
      return null;
    }
  }

  public async quickSearch(query: string): Promise<any[]> {
    const url = `${this.baseUrl}/api/v2/mangas/quick_search?q=${encodeURIComponent(query)}`;
    try {
      const response = await fetch(url, { headers: this.getHeaders() });
      if (!response.ok) return [];
      const json = (await response.json()) as any;
      return (json && json.data) || [];
    } catch (error) {
      logger.error(`Error searching query "${query}":`, error);
      return [];
    }
  }

  public async enrichChapter(mangaItem: MangaListItem): Promise<EnrichedChapterNotification> {
    // Fetch chapter and manga detail in parallel for maximum speed
    const [chapterDetail, mangaDetail] = await Promise.all([
      this.getChapterDetail(mangaItem.newest_chapter_id),
      this.getMangaDetail(mangaItem.id),
    ]);

    const chapterNumber = mangaItem.newest_chapter_number || chapterDetail?.number || "Mới";
    const chapterTitle = chapterDetail?.name ? chapterDetail.name : "";
    const mangaTitle = mangaItem.name || mangaDetail?.name || "Truyện Tranh";
    const coverUrl = rewriteStorageUrl(
      mangaDetail?.cover_url ||
      mangaItem.cover_url ||
      mangaDetail?.cover_mobile_url ||
      mangaItem.cover_mobile_url ||
      ""
    );
    const mangaUrl = `${this.baseUrl}/mangas/${mangaItem.id}`;
    const chapterUrl = `${this.baseUrl}/mangas/${mangaItem.id}/chapters/${mangaItem.newest_chapter_id}`;

    const authorName = mangaDetail?.author?.name || "Đang cập nhật";
    const teamName =
      chapterDetail?.team?.name ||
      mangaDetail?.team?.name ||
      "Cuutruyen Scanlation";
    const teamFacebook =
      chapterDetail?.team?.facebook_address ||
      mangaDetail?.team?.facebook_address ||
      null;

    const tags = mangaDetail?.tags?.map((t) => t.name) || [];
    const description =
      mangaDetail?.description ||
      chapterDetail?.manga?.description ||
      "Chưa có tóm tắt cho truyện này.";

    const rawPanorama =
      mangaDetail?.panorama_url ||
      chapterDetail?.manga?.panorama_url ||
      mangaDetail?.panorama_mobile_url ||
      null;
    const panoramaUrl = rawPanorama ? rewriteStorageUrl(rawPanorama) : null;

    return {
      chapterId: mangaItem.newest_chapter_id,
      chapterNumber,
      chapterTitle,
      chapterCreatedAt: mangaItem.newest_chapter_created_at,
      chapterUrl,
      mangaId: mangaItem.id,
      mangaTitle,
      mangaUrl,
      coverUrl,
      authorName,
      teamName,
      teamFacebook,
      tags,
      description,
      viewsCount: mangaDetail?.views_count,
      dominantColor: mangaDetail?.panorama_dominant_color_2 || mangaDetail?.panorama_dominant_color || "#4DBA87",
      isNsfw: mangaDetail?.is_nsfw ?? false,
      panoramaUrl,
    };
  }

  public getStatus() {
    return {
      isLoggedIn: !!(this.authToken && this.userId),
      userId: this.userId,
      baseUrl: this.baseUrl,
    };
  }
}

export const cuutruyenClient = new CuutruyenClient();
