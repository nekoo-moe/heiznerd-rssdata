/**
 * src/manhwa/domainResolver.ts
 * Production-grade Auto Domain Rotation & Resolver for TruyenQQ.
 * Features:
 * - Two-phase probing (Fast-path cached check + Concurrent Fan-out probe across 20+ candidate gateways & suffixes).
 * - Hostname label verification & 5-stage HTML content signature verification (detects parking ads, Cloudflare, 5xx).
 * - Transparent auto-redirect interception & real-time SQLite persistence.
 * - Single-flight mutex deduplication to prevent concurrent probe storms.
 */

import { SettingsRepository } from "../database/repositories/settingsRepo";
import { logger } from "../utils/logger";

export const SETTINGS_TRUYENQQ_BASE_URL = "truyenqq_base_url";
export const SETTINGS_TRUYENQQ_VERIFIED_AT = "truyenqq_verified_at";
export const DEFAULT_FALLBACK_DOMAIN = "https://truyenqqko.com";
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_TIMEOUT_MS = 3000;
export const MIN_HTML_LENGTH = 2000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * Known TruyenQQ candidate root gateways & historical rotation suffixes.
 * Ordered by highest priority & historical reliability.
 */
export const TRUYENQQ_CANDIDATE_ORIGINS: readonly string[] = [
  // Primary known active domains & redirect gateways
  "https://truyenqqko.com",
  "https://truyenqqviet.com",
  "https://truyenqqto.com",
  "https://truyenqqq.com",
  "https://truyenqq.com",
  "https://truyenqq.net",
  // Common rotation suffixes (.com)
  "https://truyenqqtop.com",
  "https://truyenqqhot.com",
  "https://truyenqqpro.com",
  "https://truyenqqvip.com",
  "https://truyenqqmoi.com",
  "https://truyenqqhay.com",
  "https://truyenqqone.com",
  "https://truyenqqno1.com",
  // Alternative TLDs
  "https://truyenqqq.vn",
  "https://truyenqq.vn",
  "https://truyenqq.org",
  "https://truyenqq.cc",
  "https://truyenqq.is",
  "https://truyenqq.me",
  "https://truyenqq.app",
  "https://truyenqq.site",
  "https://truyenqq.live",
];

/**
 * Validates that hostname is genuinely TruyenQQ and not a parking/ad squatter.
 */
export function matchesTruyenqqLabel(hostname: string): boolean {
  if (!hostname || typeof hostname !== "string") return false;
  const clean = hostname.trim().toLowerCase();

  // Reject ad parking redirects (e.g. ww547.truyenqqvip.com, sedoparking, parkingcrew)
  if (
    clean.startsWith("ww") ||
    clean.includes("parking") ||
    clean.includes("dan.com") ||
    clean.includes("afternic")
  ) {
    return false;
  }

  // Must contain 'truyenqq'
  return clean.includes("truyenqq");
}

/**
 * 5-Stage Rejection Pipeline verifying TruyenQQ HTML authenticity.
 */
export function verifyTruyenqqHtml(html: string): { ok: boolean; reason?: string } {
  if (!html || typeof html !== "string") {
    return { ok: false, reason: "Empty or invalid response body" };
  }

  if (html.length < MIN_HTML_LENGTH) {
    return {
      ok: false,
      reason: `Response body too short (${html.length} bytes < ${MIN_HTML_LENGTH} threshold)`,
    };
  }

  const lower = html.toLowerCase();

  // 1. Domain Parking & Squatter detection
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
    "ww547",
    "tkn=",
  ];
  for (const sig of parkingSignatures) {
    if (lower.includes(sig)) {
      return { ok: false, reason: `Domain parking detected ("${sig}")` };
    }
  }

  // 2. Cloudflare Challenge detection
  if (
    lower.includes("cf-browser-verification") ||
    lower.includes("just a moment") ||
    lower.includes("_cf_chl_opt") ||
    lower.includes("turnstile")
  ) {
    return { ok: false, reason: "Cloudflare challenge page detected" };
  }

  // 3. Provider Origin Error detection
  if (lower.includes("lỗi server 5xx") || lower.includes("origin is unreachable")) {
    return { ok: false, reason: "Origin server error" };
  }

  // 4. Positive Content Signature Check:
  // Must include 'truyenqq' AND at least one core layout marker
  const hasBrand = lower.includes("truyenqq");
  const hasLayout =
    lower.includes("list_grid") ||
    lower.includes("book_avatar") ||
    lower.includes("story-detail-info") ||
    lower.includes("the-loai") ||
    lower.includes("truyen-tranh") ||
    lower.includes("name-chap");

  if (!hasBrand || !hasLayout) {
    return {
      ok: false,
      reason: `Missing content signatures (hasBrand=${hasBrand}, hasLayout=${hasLayout})`,
    };
  }

  return { ok: true };
}

export interface TruyenqqProbeResult {
  candidate: string;
  ok: boolean;
  statusCode?: number;
  responseTimeMs: number;
  finalUrl?: string;
  reason?: string;
  error?: string;
}

export class TruyenqqDomainResolver {
  private static instance: TruyenqqDomainResolver;
  private activeDomain: string = DEFAULT_FALLBACK_DOMAIN;
  private activeResolutionPromise: Promise<string> | null = null;

  public static getInstance(): TruyenqqDomainResolver {
    if (!TruyenqqDomainResolver.instance) {
      TruyenqqDomainResolver.instance = new TruyenqqDomainResolver();
    }
    return TruyenqqDomainResolver.instance;
  }

  constructor() {
    const saved = SettingsRepository.get(SETTINGS_TRUYENQQ_BASE_URL);
    if (saved && saved.startsWith("http")) {
      try {
        const parsed = new URL(saved);
        if (matchesTruyenqqLabel(parsed.hostname)) {
          this.activeDomain = parsed.origin.toLowerCase();
        }
      } catch {
        this.activeDomain = DEFAULT_FALLBACK_DOMAIN;
      }
    }
  }

  /**
   * Returns current memoized active domain without triggering network requests.
   */
  public getActiveDomain(): string {
    return this.activeDomain;
  }

  /**
   * Intercepts redirected URLs from scraper requests and updates domain in real-time.
   */
  public handleRedirect(destUrl: string): string | null {
    if (!destUrl || typeof destUrl !== "string") return null;

    try {
      const parsed = new URL(destUrl);
      const newOrigin = parsed.origin.toLowerCase();

      if (matchesTruyenqqLabel(parsed.hostname) && newOrigin !== this.activeDomain) {
        logger.success(
          `[TruyenQQ] Domain rotation detected via HTTP redirect! Switched from "${this.activeDomain}" to "${newOrigin}".`
        );
        this.activeDomain = newOrigin;
        SettingsRepository.set(SETTINGS_TRUYENQQ_BASE_URL, newOrigin);
        SettingsRepository.set(SETTINGS_TRUYENQQ_VERIFIED_AT, new Date().toISOString());
        return newOrigin;
      }
    } catch {
      // Ignore malformed URL
    }
    return null;
  }

  /**
   * Probes an arbitrary URL with label matching and signature verification.
   */
  public async probeUrl(url: string, externalSignal?: AbortSignal): Promise<TruyenqqProbeResult> {
    const start = Date.now();
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return {
        candidate: url,
        ok: false,
        responseTimeMs: Date.now() - start,
        error: "Invalid URL syntax",
      };
    }

    if (!matchesTruyenqqLabel(hostname)) {
      return {
        candidate: url,
        ok: false,
        responseTimeMs: Date.now() - start,
        reason: `Hostname "${hostname}" rejected (does not match truyenqq label)`,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timer);
        return {
          candidate: url,
          ok: false,
          responseTimeMs: 0,
          error: "Aborted",
        };
      }
      externalSignal.addEventListener("abort", onExternalAbort);
    }

    try {
      const probeTarget = `${url.replace(/\/+$/, "")}/the-loai/manhwa-49?country=3&sort=2`;
      const res = await fetch(probeTarget, {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      const responseTimeMs = Date.now() - start;
      const finalUrl = res.url || url;
      let finalHost = "";
      try {
        finalHost = new URL(finalUrl).hostname;
      } catch {
        finalHost = "";
      }

      if (!matchesTruyenqqLabel(finalHost)) {
        return {
          candidate: url,
          ok: false,
          statusCode: res.status,
          responseTimeMs,
          finalUrl,
          reason: `Redirected to untrusted hostname: "${finalHost}"`,
        };
      }

      if (!res.ok) {
        return {
          candidate: url,
          ok: false,
          statusCode: res.status,
          responseTimeMs,
          finalUrl,
          reason: `HTTP ${res.status}`,
        };
      }

      const html = await res.text().catch(() => "");
      const verification = verifyTruyenqqHtml(html);

      return {
        candidate: url,
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
        ok: false,
        responseTimeMs,
        error: isTimeout ? `Timed out after ${DEFAULT_TIMEOUT_MS}ms` : err.message || "Network error",
      };
    } finally {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
    }
  }

  /**
   * Main domain resolution: verifies active domain (Fast-Path) or probes candidates (Fan-Out).
   * Deduplicated via single-flight promise.
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

  private async _executeResolve(forceRefresh: boolean): Promise<string> {
    // Phase 1: Fast-Path (Probe currently active domain)
    if (!forceRefresh && this.activeDomain) {
      const probe = await this.probeUrl(this.activeDomain);
      if (probe.ok) {
        let verifiedOrigin = this.activeDomain;
        if (probe.finalUrl) {
          try {
            verifiedOrigin = new URL(probe.finalUrl).origin.toLowerCase();
          } catch {
            // keep current
          }
        }

        if (verifiedOrigin !== this.activeDomain) {
          logger.success(`[TruyenQQ] Active domain redirected to: ${verifiedOrigin}`);
        }

        this.activeDomain = verifiedOrigin;
        SettingsRepository.set(SETTINGS_TRUYENQQ_BASE_URL, verifiedOrigin);
        SettingsRepository.set(SETTINGS_TRUYENQQ_VERIFIED_AT, new Date().toISOString());
        return verifiedOrigin;
      }

      logger.warn(
        `[TruyenQQ] Current domain "${this.activeDomain}" probe failed (${probe.reason || probe.error}). Initiating fan-out across candidates...`
      );
    }

    // Phase 2: Fan-Out Probe across candidates
    logger.crawler(
      `[TruyenQQ] Fan-out probing across ${TRUYENQQ_CANDIDATE_ORIGINS.length} candidate domains (concurrency=${DEFAULT_CONCURRENCY})...`
    );

    const candidates = [...TRUYENQQ_CANDIDATE_ORIGINS];
    const results = new Array<TruyenqqProbeResult | null>(candidates.length).fill(null);
    let nextIdx = 0;
    let winnerIndex: number | null = null;
    const abortController = new AbortController();

    const worker = async (): Promise<void> => {
      while (nextIdx < candidates.length && winnerIndex === null) {
        const idx = nextIdx++;
        if (idx >= candidates.length || winnerIndex !== null) return;

        const candidate = candidates[idx];
        const probeResult = await this.probeUrl(candidate, abortController.signal);
        results[idx] = probeResult;

        for (let i = 0; i < candidates.length; i++) {
          if (results[i] === null) {
            break;
          }
          if (results[i]!.ok) {
            winnerIndex = i;
            abortController.abort();
            return;
          }
        }
      }
    };

    const workerCount = Math.min(DEFAULT_CONCURRENCY, candidates.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

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
      const targetUrl = winner.finalUrl || winner.candidate;
      const verifiedOrigin = new URL(targetUrl).origin.toLowerCase();

      this.activeDomain = verifiedOrigin;
      SettingsRepository.set(SETTINGS_TRUYENQQ_BASE_URL, verifiedOrigin);
      SettingsRepository.set(SETTINGS_TRUYENQQ_VERIFIED_AT, new Date().toISOString());

      logger.success(
        `[TruyenQQ] Resolved new active domain: ${verifiedOrigin} (${winner.responseTimeMs}ms, candidate: ${winner.candidate})`
      );
      return verifiedOrigin;
    }

    // All failed -> fallback
    logger.error("[TruyenQQ] All candidate domains failed probe. Falling back to default.");
    return this.activeDomain || DEFAULT_FALLBACK_DOMAIN;
  }
}

export const truyenqqDomainResolver = TruyenqqDomainResolver.getInstance();
