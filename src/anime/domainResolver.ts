/**
 * src/anime/domainResolver.ts
 * Production Domain Resolver for AnimeVietsub with two-phase probing,
 * hostname label validation, 5-stage signature verification, and SQLite persistence.
 */

import { SettingsRepository } from "../database/repositories/settingsRepo";
import { logger } from "../utils/logger";
import {
  ANIMEVIETSUB_CANDIDATE_TLDS,
  DomainResolverConfig,
  IDomainResolver,
  IAnimevietsubDomainResolver,
  ProbeResult,
  VerifyResult,
} from "./types";

// Re-export candidate TLDs
export { ANIMEVIETSUB_CANDIDATE_TLDS };

// ============================================================================
// Constants & Defaults
// ============================================================================

export const DEFAULT_LABEL = "animevietsub";
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_TIMEOUT_MS = 2500;
export const SETTINGS_BASE_URL_KEY = "animevietsub_base_url";
export const SETTINGS_VERIFIED_AT_KEY = "animevietsub_verified_at";
export const DEFAULT_FALLBACK_URL = "https://animevietsub.zip";
export const MIN_HTML_LENGTH = 2000;

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// ============================================================================
// Helper Functions: Security & Verification
// ============================================================================

/**
 * Validates that the hostname's registrable second-to-last label strictly matches
 * the expected provider label (e.g. 'animevietsub').
 *
 * Prevents DNS hijack / parking redirect attacks:
 * - 'animevietsub.zip'       -> parts: ['animevietsub', 'zip']       -> match: 'animevietsub' (TRUE)
 * - 'www.animevietsub.tv'   -> parts: ['www', 'animevietsub', 'tv']  -> match: 'animevietsub' (TRUE)
 * - 'click-v4.expclknb.com' -> parts: ['click-v4', 'expclknb', 'com']-> match: 'expclknb'     (FALSE)
 * - 'animevietsub.hacker.io'-> parts: ['animevietsub', 'hacker', 'io']-> match: 'hacker'      (FALSE)
 */
export function matchesLabel(hostname: string, label: string = DEFAULT_LABEL): boolean {
  if (!hostname || typeof hostname !== "string") return false;
  const clean = hostname.trim().toLowerCase();
  const parts = clean.split(".");
  if (parts.length < 2) return false;
  const secondToLast = parts[parts.length - 2];
  return secondToLast === label.toLowerCase();
}

/**
 * 5-Stage Rejection Pipeline verifying provider HTML content authenticity.
 */
export function verifyProviderHtml(html: string): VerifyResult {
  // 1. Length guard: genuine AnimeVietsub homepage/catalog pages are 50KB - 300KB
  if (!html || typeof html !== "string") {
    return { ok: false, reason: "Empty or invalid response body" };
  }
  if (html.length < MIN_HTML_LENGTH) {
    return {
      ok: false,
      reason: `Response body too short (${html.length} bytes < ${MIN_HTML_LENGTH} threshold)`,
      contentLength: html.length,
    };
  }

  const lower = html.toLowerCase();

  // 2. Cloudflare Challenge / Turnstile detection
  const cfSignatures = [
    "just a moment",
    "cf-browser-verification",
    "checking your browser",
    "enable javascript and cookies",
    "_cf_chl_opt",
    "turnstile",
  ];
  for (const sig of cfSignatures) {
    if (lower.includes(sig)) {
      return { ok: false, reason: `Cloudflare challenge detected ("${sig}")` };
    }
  }
  if (lower.includes("cloudflare") && lower.includes("challenge")) {
    return { ok: false, reason: "Cloudflare challenge page detected" };
  }
  if (lower.includes("ray id") && html.length < 15000) {
    return { ok: false, reason: "Cloudflare block/challenge page with Ray ID" };
  }

  // 3. Provider Origin 5xx Error Page detection
  if (lower.includes("lỗi server 5xx") || lower.includes("loi server 5xx")) {
    return { ok: false, reason: "Origin server 5xx error page" };
  }
  if (
    lower.includes("web server is returning an unknown error") &&
    !lower.includes("/phim/")
  ) {
    return { ok: false, reason: "Cloudflare origin server down (520/521)" };
  }

  // 4. Domain Parking & Squatter detection
  const parkingSignatures = [
    "domain for sale",
    "this domain is for sale",
    "buy this domain",
    "domain is parked",
    "parked domain",
    "parkingcrew",
    "sedoparking",
    "afternic",
    "dan.com",
    "godaddy.com/domainsearch",
    "namecheap.com",
  ];
  for (const sig of parkingSignatures) {
    if (lower.includes(sig)) {
      return { ok: false, reason: `Domain parking detected ("${sig}")` };
    }
  }

  // 5. Positive Content Signature Check:
  // Must include '/phim/' (anime page route) and 'tpost' / 'tpostmv' (card container class)
  const hasPhim = lower.includes("/phim/");
  const hasTpost = lower.includes("tpost");

  if (!hasPhim || !hasTpost) {
    return {
      ok: false,
      reason: `Missing content signatures (hasPhim=${hasPhim}, hasTpost=${hasTpost})`,
      contentLength: html.length,
    };
  }

  return {
    ok: true,
    contentLength: html.length,
  };
}

/**
 * Normalizes a base URL to canonical form (protocol + hostname without trailing slash).
 */
export function canonicalizeUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  return parsed.origin.toLowerCase();
}

/**
 * Builds candidate origin URLs from TLD list.
 */
export function buildCandidateOrigins(
  candidateTlds: readonly string[] = ANIMEVIETSUB_CANDIDATE_TLDS
): string[] {
  return candidateTlds.map((tld) => `https://animevietsub.${tld}`);
}

// ============================================================================
// AnimevietsubDomainResolver Implementation
// ============================================================================

export class AnimevietsubDomainResolver implements IDomainResolver, IAnimevietsubDomainResolver {
  private readonly candidateTlds: readonly string[];
  private readonly concurrency: number;
  private readonly timeoutMs: number;
  private readonly label: string;
  private readonly settingsKey: string;
  private readonly settingsVerifiedAtKey: string;
  private readonly fallbackDomain: string;
  private readonly fetchImpl: typeof fetch;

  /** In-memory memoized domain to minimize database reads */
  private memoizedBaseUrl: string | null = null;

  /** Active resolution promise for single-flight mutex deduplication */
  private activeResolutionPromise: Promise<string> | null = null;

  constructor(config: DomainResolverConfig = {}) {
    this.candidateTlds = config.candidateTlds ?? ANIMEVIETSUB_CANDIDATE_TLDS;
    this.concurrency = config.concurrency ?? DEFAULT_CONCURRENCY;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.label = config.label ?? DEFAULT_LABEL;
    this.settingsKey = config.settingsKey ?? SETTINGS_BASE_URL_KEY;
    this.settingsVerifiedAtKey = config.settingsVerifiedAtKey ?? SETTINGS_VERIFIED_AT_KEY;
    this.fallbackDomain = config.fallbackDomain ?? DEFAULT_FALLBACK_URL;
    this.fetchImpl = config.customFetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Retrieves the current immutable configuration.
   */
  public getConfig(): Readonly<DomainResolverConfig> {
    return {
      candidateTlds: this.candidateTlds,
      concurrency: this.concurrency,
      timeoutMs: this.timeoutMs,
      label: this.label,
      settingsKey: this.settingsKey,
      settingsVerifiedAtKey: this.settingsVerifiedAtKey,
      fallbackDomain: this.fallbackDomain,
    };
  }

  /**
   * Retrieves the currently cached domain without initiating network probes.
   */
  public getCachedDomain(): string | null {
    if (this.memoizedBaseUrl) {
      return this.memoizedBaseUrl;
    }
    const dbValue = SettingsRepository.get(this.settingsKey);
    if (dbValue) {
      try {
        const canonical = canonicalizeUrl(dbValue);
        this.memoizedBaseUrl = canonical;
        return canonical;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Alias to getCachedDomain for interface compatibility.
   */
  public getActiveDomain(): string | null {
    return this.getCachedDomain();
  }

  /**
   * Clears in-memory and SQLite cache.
   */
  public clearCache(): void {
    this.memoizedBaseUrl = null;
    SettingsRepository.delete(this.settingsKey);
    SettingsRepository.delete(this.settingsVerifiedAtKey);
  }

  /**
   * Main resolution method: resolves the active AnimeVietsub base URL.
   * Utilizes single-flight promise deduplication to prevent concurrent probe races.
   */
  public async resolveDomain(forceRefresh: boolean = false): Promise<string> {
    if (this.activeResolutionPromise) {
      return this.activeResolutionPromise;
    }

    this.activeResolutionPromise = this._executeResolve(forceRefresh).finally(() => {
      this.activeResolutionPromise = null;
    });

    return this.activeResolutionPromise;
  }

  /**
   * Static convenience method delegating to the default singleton instance.
   */
  public static async resolveDomain(forceRefresh: boolean = false): Promise<string> {
    return animevietsubDomainResolver.resolveDomain(forceRefresh);
  }

  /**
   * Internal two-phase execution flow.
   */
  private async _executeResolve(forceRefresh: boolean): Promise<string> {
    // Phase 1: Fast-Path (Cached Probe)
    if (!forceRefresh) {
      const cached = this.getCachedDomain();
      if (cached) {
        try {
          const parsed = new URL(cached);
          if (matchesLabel(parsed.hostname, this.label)) {
            const probe = await this.probeUrl(cached);
            if (probe.ok) {
              const verifiedUrl = probe.finalUrl ? canonicalizeUrl(probe.finalUrl) : cached;
              this.memoizedBaseUrl = verifiedUrl;
              SettingsRepository.set(this.settingsKey, verifiedUrl);
              SettingsRepository.set(this.settingsVerifiedAtKey, new Date().toISOString());
              logger.debug(`Fast-path domain verified: ${verifiedUrl} (${probe.responseTimeMs}ms)`);
              return verifiedUrl;
            }
            logger.warn(
              `Fast-path domain verification failed for "${cached}": ${probe.reason || probe.error}. Starting fan-out...`
            );
          }
        } catch (err: any) {
          logger.warn(`Failed parsing cached domain "${cached}": ${err.message}`);
        }
      }
    }

    // Phase 2: Fan-Out Probe (Concurrent Priority-Preserving Search)
    logger.crawler(
      `Starting fan-out probe across ${this.candidateTlds.length} candidates with concurrency=${this.concurrency}...`
    );
    const resolved = await this._fanOutProbe();
    return resolved;
  }

  /**
   * Probes an arbitrary URL with timeout, label validation, and signature verification.
   */
  public async probeUrl(url: string, externalSignal?: AbortSignal): Promise<ProbeResult> {
    const start = Date.now();
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return {
        candidate: url,
        origin: url,
        ok: false,
        responseTimeMs: Date.now() - start,
        error: "Invalid URL syntax",
      };
    }

    if (!matchesLabel(hostname, this.label)) {
      return {
        candidate: url,
        origin: url,
        ok: false,
        responseTimeMs: Date.now() - start,
        reason: `Hostname "${hostname}" does not match label "${this.label}"`,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timer);
        return {
          candidate: url,
          origin: url,
          ok: false,
          responseTimeMs: 0,
          error: "Aborted by external signal",
        };
      }
      externalSignal.addEventListener("abort", onExternalAbort);
    }

    try {
      let res = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      // Handle Cloudflare cookie handshake challenge (403 with Set-Cookie and window.location.href)
      if (res.status === 403) {
        const cookies = (res.headers as any).getSetCookie
          ? (res.headers as any).getSetCookie()
          : [res.headers.get("set-cookie")].filter(Boolean);
        const cookieHeader = (cookies as string[]).map((c) => c.split(";")[0]).join("; ");

        if (cookieHeader) {
          const bodyText = await res.text().catch(() => "");
          if (bodyText.includes("window.location.href") || bodyText.includes("rocket-loader")) {
            const redirectMatch = bodyText.match(/window\.location\.href\s*=\s*["']([^"']+)["']/);
            const redirectPath = redirectMatch ? redirectMatch[1] : "/";
            const retryUrl = new URL(redirectPath, res.url || url).href;

            res = await this.fetchImpl(retryUrl, {
              method: "GET",
              headers: {
                "User-Agent": BROWSER_USER_AGENT,
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
                Cookie: cookieHeader,
              },
              signal: controller.signal,
              redirect: "follow",
            });
          }
        }
      }

      const responseTimeMs = Date.now() - start;
      const finalUrl = res.url || url;
      let finalHost = "";
      try {
        finalHost = new URL(finalUrl).hostname;
      } catch {
        finalHost = "";
      }

      // Ensure final redirect destination is trusted
      if (!matchesLabel(finalHost, this.label)) {
        return {
          candidate: url,
          origin: url,
          ok: false,
          statusCode: res.status,
          responseTimeMs,
          finalUrl,
          reason: `Redirected to untrusted hostname: "${finalHost}"`,
        };
      }

      const html = await res.text().catch(() => "");

      if (res.status >= 400) {
        // Special case: Cloudflare protection challenge on genuine domain (common on datacenter IPs / prod)
        const lower = html.toLowerCase();
        const isCloudflare =
          lower.includes("cf-browser-verification") ||
          lower.includes("just a moment") ||
          lower.includes("_cf_chl_opt") ||
          lower.includes("turnstile") ||
          res.headers.get("server")?.toLowerCase().includes("cloudflare") ||
          res.headers.get("cf-ray") !== null;

        // Check if HTML actually contains provider content signatures despite status code
        const verification = verifyProviderHtml(html);
        if (verification.ok) {
          return {
            candidate: url,
            origin: url,
            ok: true,
            statusCode: res.status,
            responseTimeMs,
            finalUrl,
          };
        }

        if (isCloudflare && matchesLabel(finalHost, this.label)) {
          return {
            candidate: url,
            origin: url,
            ok: true,
            statusCode: res.status,
            responseTimeMs,
            finalUrl,
            reason: "Domain active behind Cloudflare challenge",
          };
        }

        return {
          candidate: url,
          origin: url,
          ok: false,
          statusCode: res.status,
          responseTimeMs,
          finalUrl,
          reason: `HTTP ${res.status} error response`,
        };
      }

      const verification = verifyProviderHtml(html);

      return {
        candidate: url,
        origin: url,
        ok: verification.ok,
        statusCode: res.status,
        responseTimeMs,
        finalUrl,
        reason: verification.reason,
      };
    } catch (err: any) {
      const responseTimeMs = Date.now() - start;
      const isTimeout = controller.signal.aborted && !externalSignal?.aborted;
      return {
        candidate: url,
        origin: url,
        ok: false,
        responseTimeMs,
        error: isTimeout ? `Request timed out after ${this.timeoutMs}ms` : err.message || "Network error",
      };
    } finally {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
    }
  }

  /**
   * Probes a candidate TLD (e.g. 'zip' or 'tv').
   */
  public async probeCandidate(
    candidateTld: string,
    externalSignal?: AbortSignal
  ): Promise<ProbeResult> {
    const origin = `https://animevietsub.${candidateTld}`;
    const result = await this.probeUrl(origin, externalSignal);
    return {
      ...result,
      candidate: candidateTld,
    };
  }

  /**
   * Public domain verification method satisfying IDomainResolver.
   */
  public async verifyDomain(url: string): Promise<VerifyResult> {
    const probe = await this.probeUrl(url);
    return {
      ok: probe.ok,
      reason: probe.reason || probe.error,
      statusCode: probe.statusCode,
      finalUrl: probe.finalUrl,
    };
  }

  /**
   * Executes concurrent fan-out across candidate TLDs while deterministically
   * preserving priority order.
   */
  private async _fanOutProbe(): Promise<string> {
    const candidates = [...this.candidateTlds];
    const results = new Array<ProbeResult | null>(candidates.length).fill(null);
    let nextIdx = 0;
    let winnerIndex: number | null = null;

    const abortController = new AbortController();

    const worker = async (): Promise<void> => {
      while (nextIdx < candidates.length && winnerIndex === null) {
        const idx = nextIdx++;
        if (idx >= candidates.length || winnerIndex !== null) return;

        const tld = candidates[idx];
        const probeResult = await this.probeCandidate(tld, abortController.signal);
        results[idx] = probeResult;

        // Determine if lowest completed successful candidate is ready
        for (let i = 0; i < candidates.length; i++) {
          if (results[i] === null) {
            // An earlier, higher-priority candidate is still in-flight. Must wait.
            break;
          }
          if (results[i]!.ok) {
            // Winner identified! All higher-priority candidates have completed and failed.
            winnerIndex = i;
            abortController.abort();
            return;
          }
        }
      }
    };

    const workerCount = Math.min(this.concurrency, candidates.length);
    const pool = Array.from({ length: workerCount }, () => worker());
    await Promise.all(pool);

    // If no early winner was flagged, perform a final deterministic scan
    if (winnerIndex === null) {
      for (let i = 0; i < candidates.length; i++) {
        if (results[i]?.ok) {
          winnerIndex = i;
          break;
        }
      }
    }

    if (winnerIndex !== null) {
      const winner = results[winnerIndex]!;
      const targetUrl = winner.finalUrl || winner.origin;
      const canonical = canonicalizeUrl(targetUrl);

      // Persist to SQLite and memory
      this.memoizedBaseUrl = canonical;
      SettingsRepository.set(this.settingsKey, canonical);
      SettingsRepository.set(this.settingsVerifiedAtKey, new Date().toISOString());

      logger.success(
        `Resolved active AnimeVietsub domain: ${canonical} (tld: .${winner.candidate}, ${winner.responseTimeMs}ms)`
      );
      return canonical;
    }

    // All candidates failed verification
    const failureSummary = results
      .map((r, i) => `.${candidates[i]}: ${r?.reason || r?.error || "unprobed"}`)
      .join(", ");
    logger.error(`All candidate TLDs failed verification: ${failureSummary}`);

    // Check previously stored or hardcoded fallback
    const cachedDb = SettingsRepository.get(this.settingsKey);
    let fallback = this.fallbackDomain;

    if (cachedDb) {
      try {
        const parsed = new URL(cachedDb);
        if (matchesLabel(parsed.hostname, this.label)) {
          fallback = cachedDb;
        }
      } catch {
        // Ignore malformed cached URL
      }
    }

    if (fallback) {
      const canonicalFallback = canonicalizeUrl(fallback);
      logger.warn(`Falling back to emergency domain: ${canonicalFallback}`);
      this.memoizedBaseUrl = canonicalFallback;
      return canonicalFallback;
    }

    throw new Error(
      `AnimevietsubDomainResolver: Unable to resolve any working domain from candidates: [${candidates.join(", ")}]. Errors: ${failureSummary}`
    );
  }
}

// Export default singleton instance
export const animevietsubDomainResolver = new AnimevietsubDomainResolver();
export const domainResolver = animevietsubDomainResolver;
