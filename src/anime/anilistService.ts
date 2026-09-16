import { AniListMetadata, IAnilistService, NormalizedTitle } from "./types";
import { normalizeAnimeTitle } from "./normalizer";
import { logger } from "../utils/logger";

const ANILIST_GRAPHQL_ENDPOINT = "https://graphql.anilist.co";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const SEARCH_ANIME_QUERY = `
query ($search: String) {
  Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
    id
    title {
      romaji
      english
      native
    }
    coverImage {
      extraLarge
      large
      color
    }
    bannerImage
    description(asHtml: false)
    episodes
    averageScore
    genres
    studios(isMain: true) {
      nodes {
        name
      }
    }
    siteUrl
  }
}
`.trim();

interface CacheEntry {
  data: AniListMetadata | null;
  timestamp: number;
}

export class AnilistService implements IAnilistService {
  private cache = new Map<string, CacheEntry>();
  private lastRequestTime = 0;
  private minRequestIntervalMs = 350; // Spacing to avoid burst 429s
  private requestQueue: Promise<void> = Promise.resolve();

  public normalizeTitle(rawTitle: string, animeUrl?: string): NormalizedTitle {
    return normalizeAnimeTitle(rawTitle, animeUrl);
  }

  /**
   * Enriches an anime title with AniList metadata and wide panoramic banner.
   * Checks cache, then iterates candidate titles until a high-confidence match is found.
   */
  public async enrich(title: string, animeUrl?: string): Promise<AniListMetadata | null> {
    if (!title || typeof title !== "string") return null;

    const normalized = this.normalizeTitle(title, animeUrl);
    const cacheKey = (animeUrl || normalized.primary).toLowerCase().trim();

    // 1. Check in-memory cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    // 2. Query candidates
    let match: AniListMetadata | null = null;

    for (const candidate of normalized.candidates) {
      if (!candidate || candidate.length < 2) continue;

      try {
        match = await this.queryAnilist(candidate);
        if (match) {
          logger.info(`[AniList] Matched "${candidate}" -> ID: ${match.id} ("${match.romajiTitle}")`);
          break;
        }
      } catch (err: any) {
        logger.warn(`[AniList] Error querying candidate "${candidate}": ${err?.message || err}`);
      }
    }

    // 3. Cache result (including nulls to prevent pounding AniList for unlisted titles)
    this.cache.set(cacheKey, {
      data: match,
      timestamp: Date.now(),
    });

    return match;
  }

  /**
   * Executes a GraphQL request to AniList with rate-limiting and sequential queueing.
   */
  private async queryAnilist(search: string): Promise<AniListMetadata | null> {
    return new Promise<AniListMetadata | null>((resolve, reject) => {
      this.requestQueue = this.requestQueue
        .then(async () => {
          const now = Date.now();
          const elapsed = now - this.lastRequestTime;
          if (elapsed < this.minRequestIntervalMs) {
            await new Promise((r) => setTimeout(r, this.minRequestIntervalMs - elapsed));
          }

          this.lastRequestTime = Date.now();

          const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "User-Agent": "NekoStream-AniList/1.0",
            },
            body: JSON.stringify({
              query: SEARCH_ANIME_QUERY,
              variables: { search },
            }),
          });

          if (response.status === 429) {
            const retrySec = parseInt(response.headers.get("Retry-After") || "5", 10);
            logger.warn(`[AniList] Rate limit reached. Backing off for ${retrySec}s...`);
            await new Promise((r) => setTimeout(r, (retrySec + 1) * 1000));
            return this.queryAnilist(search);
          }

          if (!response.ok) {
            if (response.status === 404) {
              return null;
            }
            throw new Error(`AniList returned HTTP ${response.status}: ${response.statusText}`);
          }

          const json = (await response.json()) as any;
          const media = json?.data?.Media;
          if (!media) return null;

          const studio =
            media.studios?.nodes && media.studios.nodes.length > 0
              ? media.studios.nodes[0].name
              : null;

          const metadata: AniListMetadata = {
            id: media.id,
            romajiTitle: media.title?.romaji || search,
            englishTitle: media.title?.english || null,
            nativeTitle: media.title?.native || null,
            bannerImage: media.bannerImage || null,
            coverImage:
              media.coverImage?.extraLarge ||
              media.coverImage?.large ||
              "",
            color: media.coverImage?.color || "#4dba87",
            genres: media.genres || [],
            studio,
            averageScore: media.averageScore ?? null,
            episodes: media.episodes ?? null,
            description: media.description
              ? media.description.replace(/<[^>]*>?/gm, "").trim()
              : null,
            siteUrl: media.siteUrl || `https://anilist.co/anime/${media.id}`,
          };

          return metadata;
        })
        .then(resolve)
        .catch(reject);
    });
  }

  /**
   * Clears the cache.
   */
  public clearCache(): void {
    this.cache.clear();
  }
}

export const anilistService = new AnilistService();

