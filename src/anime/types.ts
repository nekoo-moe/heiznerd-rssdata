/**
 * src/anime/types.ts
 * Centralized TypeScript type definitions for Anime subsystem (M2 - M5).
 */

// ============================================================================
// 1. Domain Resolver Types (M2)
// ============================================================================

/**
 * Prioritized list of candidate Top-Level Domains (TLDs) for AnimeVietsub.
 * Ordered by historical reliability and operational status.
 */
export const ANIMEVIETSUB_CANDIDATE_TLDS = [
  "zip",  // Currently active primary origin (September 2026)
  "tv",   // Long-lived redirector origin
  "site", // Long-lived primary
  "love", // Secondary mirror
  "fan",  // Active redirector origin
  "bz",   // Historical mirror
  "pro",  // Historical mirror (monitored for ad redirects)
  "net",  // Backup mirror
  "cc",   // Backup redirector
] as const;

export type CandidateTld = (typeof ANIMEVIETSUB_CANDIDATE_TLDS)[number];

/**
 * Content signature verification result.
 */
export interface VerifyResult {
  ok: boolean;
  reason?: string;
  statusCode?: number;
  contentLength?: number;
  finalUrl?: string;
}

/**
 * Detailed outcome of probing an individual candidate origin.
 */
export interface ProbeResult {
  candidate: string;
  origin: string;
  ok: boolean;
  statusCode?: number;
  responseTimeMs: number;
  finalUrl?: string;
  error?: string;
  reason?: string;
}

/**
 * Configuration options for AnimevietsubDomainResolver.
 */
export interface DomainResolverConfig {
  /** List of candidate TLDs to probe (default: ANIMEVIETSUB_CANDIDATE_TLDS) */
  candidateTlds?: readonly string[];
  /** Maximum number of concurrent probe requests during fan-out (default: 4) */
  concurrency?: number;
  /** Timeout in milliseconds for each candidate probe (default: 2500ms) */
  timeoutMs?: number;
  /** Registrable second-level domain label to enforce (default: 'animevietsub') */
  label?: string;
  /** SQLite setting key for caching the active base URL (default: 'animevietsub_base_url') */
  settingsKey?: string;
  /** SQLite setting key for recording the verification timestamp (default: 'animevietsub_verified_at') */
  settingsVerifiedAtKey?: string;
  /** Hardcoded emergency fallback domain if all probes fail (default: 'https://animevietsub.zip') */
  fallbackDomain?: string;
  /** Optional custom fetch implementation (for unit testing and proxy injection) */
  customFetch?: typeof fetch;
}

/**
 * Interface contract for Domain Resolver instances.
 */
export interface IDomainResolver {
  resolveDomain(forceRefresh?: boolean): Promise<string>;
  getCachedDomain(): string | null;
  verifyDomain(url: string): Promise<VerifyResult>;
  probeCandidate(candidate: string, externalSignal?: AbortSignal): Promise<ProbeResult>;
  clearCache(): void;
  getConfig(): Readonly<DomainResolverConfig>;
}

export interface IAnimevietsubDomainResolver {
  resolveDomain(forceRefresh?: boolean): Promise<string>;
  getActiveDomain?(): string | null;
  getCachedDomain?(): string | null;
}

// ============================================================================
// 2. AnimeVietsub Scraper Types (M2)
// ============================================================================

/**
 * Canonical scraped anime episode item extracted from AnimeVietsub latest updates.
 * Compatible with AnimeEpisodeInput in AnimeEpisodeRepository.
 */
export interface AnimeEpisodeItem {
  animeTitle: string;
  episodeName: string;
  episodeUrl: string;
  animeUrl: string;
  posterUrl: string;
  updatedAt?: string;
}

/**
 * Anime search result item extracted from AnimeVietsub search query.
 */
export interface AnimeSearchResult {
  title: string;
  url?: string;
  animeUrl: string;
  posterUrl: string;
  latestEpisode?: string;
  status?: string;
  synopsis?: string;
}

/**
 * Scraper configuration options.
 */
export interface AnimevietsubScraperOptions {
  timeoutMs?: number;
  selectorTimeoutMs?: number;
  maxRetries?: number;
}

/**
 * Interface contract for AnimeVietsub Scraper.
 */
export interface IAnimevietsubScraper {
  getLatestEpisodes(limit?: number): Promise<AnimeEpisodeItem[]>;
  searchAnime(query: string, limit?: number): Promise<AnimeSearchResult[]>;
  getActiveBaseUrl?(): Promise<string>;
  close?(): Promise<void>;
}

// ============================================================================
// 3. AniList Metadata & Enrichment Types (M3)
// ============================================================================

/**
 * Enriched anime metadata retrieved from AniList GraphQL API.
 */
export interface AniListMetadata {
  id: number;
  romajiTitle: string;
  englishTitle: string | null;
  nativeTitle: string | null;
  bannerImage: string | null;
  coverImage: string;
  color: string | null;
  genres: string[];
  studio: string | null;
  averageScore: number | null;
  episodes: number | null;
  description: string | null;
  siteUrl: string;
}

/**
 * Output of title normalization pipeline.
 */
export interface NormalizedTitle {
  primary: string;
  candidates: string[];
  year?: number;
  season?: number;
}

/**
 * Interface contract for AniList GraphQL Service.
 */
export interface IAnilistService {
  enrich(title: string, animeUrl?: string): Promise<AniListMetadata | null>;
  normalizeTitle(rawTitle: string, animeUrl?: string): NormalizedTitle;
}

// ============================================================================
// 4. Discord Component V2 Notification Types (M4)
// ============================================================================

/**
 * Discord Component V2 payload returned by buildAnimeNotificationV2.
 */
export interface AnimeNotificationPayload {
  flags: number;
  components: any[];
}

// ============================================================================
// 5. Crawler & Autonomous Polling Types (M5)
// ============================================================================

/**
 * Runtime telemetry stats for AnimeCrawlerManager.
 */
export interface AnimeCrawlerStats {
  isRunning: boolean;
  lastPollAt: string | null;
  totalPolled: number;
  totalDispatched: number;
  lastError: string | null;
  activeDomain: string | null;
}

/**
 * Dispatched episode notification audit event.
 */
export interface AnimeNotificationEvent {
  episode: AnimeEpisodeItem;
  anilist: AniListMetadata | null;
  channelIds: string[];
  dispatchedAt: string;
}
