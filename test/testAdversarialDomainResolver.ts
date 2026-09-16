/**
 * test/testAdversarialDomainResolver.ts
 * EMPIRICAL ADVERSARIAL CHALLENGE SUITE for AnimevietsubDomainResolver
 *
 * Challenge Dimensions:
 * 1. Adversarial mock origins: ad redirects (e.g. animevietsub.pro -> click-v4.expclknb.com),
 *    domain parking pages, 404s, 502s, empty bodies, truncated bodies (< 2000 bytes).
 * 2. Race conditions: 50 concurrent calls to resolveDomain() must collapse to single-flight
 *    and return consistent domain without duplicate network storms.
 * 3. Cache invalidation & corruption: recovery when SQLite bot_settings contains invalid,
 *    unreachable, malformed, or malicious URLs.
 * 4. Staggered concurrency & fallback stress under total failure.
 */

import { getDatabase } from "../src/database/db";
import { SettingsRepository } from "../src/database/repositories/settingsRepo";
import {
  AnimevietsubDomainResolver,
  matchesLabel,
  verifyProviderHtml,
  canonicalizeUrl,
  ANIMEVIETSUB_CANDIDATE_TLDS,
  DEFAULT_FALLBACK_URL,
  MIN_HTML_LENGTH,
} from "../src/anime/domainResolver";
import { logger } from "../src/utils/logger";
import { performance } from "perf_hooks";

// --- Assertion Utilities ---
let passedCount = 0;
let failedCount = 0;
const failureDetails: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    failedCount++;
    failureDetails.push(`[FAIL] ${message}`);
    logger.error(`[FAIL] ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
  passedCount++;
  logger.success(`[PASS] ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const isMatch = actual === expected;
  if (!isMatch) {
    failedCount++;
    const detail = `[FAIL] ${message} | Expected: ${JSON.stringify(expected)}, Received: ${JSON.stringify(actual)}`;
    failureDetails.push(detail);
    logger.error(detail);
    throw new Error(`Assertion Failed: ${message} (Expected ${expected}, got ${actual})`);
  }
  passedCount++;
  logger.success(`[PASS] ${message}`);
}

// --- Helpers to create realistic HTML payloads ---
const PADDING = "<!-- " + "X".repeat(3000) + " -->";

function makeGenuineHtml(origin: string = "https://animevietsub.zip"): string {
  return `<!DOCTYPE html>
<html lang="vi">
  <head><title>Anime Vietsub - Phim Anime Mới Nhất</title></head>
  <body>
    <div class="header"><h1>AnimeVietsub</h1></div>
    <div class="MovieList">
      <div class="TPostMv">
        <a href="${origin}/phim/one-piece-dao-hai-tac-a1/" title="One Piece">
          <span class="mli-eps">TẬP 1115</span>
        </a>
      </div>
      <div class="TPostMv">
        <a href="${origin}/phim/naruto-shippuden-a2/" title="Naruto">
          <span class="mli-eps">TẬP 500</span>
        </a>
      </div>
    </div>
    ${PADDING}
  </body>
</html>`;
}

// Mock Response Helper
function createMockResponse(
  status: number,
  body: string,
  url: string,
  headers: Record<string, string> = {}
): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...headers,
    },
  });
}

// Custom mock fetch router type
type MockFetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

async function runAdversarialDomainResolverTests() {
  const startTime = performance.now();
  const RUN_ID = Math.random().toString(36).substring(2, 8);
  logger.info("================================================================================");
  logger.info(`STARTING EMPIRICAL ADVERSARIAL CHALLENGE SUITE: AnimevietsubDomainResolver [${RUN_ID}]`);
  logger.info("================================================================================");

  // Initialize DB
  getDatabase();

  // Backup original settings
  const originalBaseUrl = SettingsRepository.get("animevietsub_base_url");
  const originalVerifiedAt = SettingsRepository.get("animevietsub_verified_at");

  try {
    // =========================================================================
    // CHALLENGE 1: Adversarial Mock Origins
    // =========================================================================
    logger.info("\n================================================================================");
    logger.info("CHALLENGE 1: ADVERSARIAL MOCK ORIGINS & SECURITY FILTERING");
    logger.info("================================================================================");

    // 1.1 Malicious Ad Redirects (The real-world animevietsub.pro scenario)
    logger.info("\n--- 1.1: Malicious Ad Redirects & Tracking Networks ---");
    {
      const adRedirects = [
        {
          name: "Direct redirect to external ad network (click-v4.expclknb.com)",
          finalUrl: "https://click-v4.expclknb.com/track?domain=animevietsub.pro",
          expectedRejectReason: "Redirected to untrusted hostname",
        },
        {
          name: "Redirect to ParkingCrew ads",
          finalUrl: "https://parkingcrew.net/?aff=9876",
          expectedRejectReason: "Redirected to untrusted hostname",
        },
        {
          name: "Redirect to Sedo Parking",
          finalUrl: "https://sedoparking.com/search/animevietsub",
          expectedRejectReason: "Redirected to untrusted hostname",
        },
        {
          name: "Subdomain Hijacking attempt (animevietsub.attacker.com)",
          finalUrl: "https://animevietsub.attacker.com/malware",
          expectedRejectReason: "Redirected to untrusted hostname",
        },
        {
          name: "Typosquatting prefix (fake-animevietsub.zip)",
          finalUrl: "https://fake-animevietsub.zip/phim/ad",
          expectedRejectReason: "Redirected to untrusted hostname",
        },
        {
          name: "Typosquatting suffix (animevietsubxyz.tv)",
          finalUrl: "https://animevietsubxyz.tv/phim/test",
          expectedRejectReason: "Redirected to untrusted hostname",
        },
        {
          name: "Ad network open-redirect parameter (http://evil.com)",
          finalUrl: "http://evil.com/payload",
          expectedRejectReason: "Redirected to untrusted hostname",
        },
      ];

      for (const ad of adRedirects) {
        // Mock fetch that simulates redirect following
        const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
          const urlStr = input.toString();
          // Simulates fetch following 302 and returning final Response with res.url = ad.finalUrl
          const res = createMockResponse(200, makeGenuineHtml(ad.finalUrl), ad.finalUrl);
          Object.defineProperty(res, "url", { value: ad.finalUrl });
          return res;
        };

        const resolver = new AnimevietsubDomainResolver({
          customFetch: mockFetch,
          candidateTlds: ["pro"],
        });

        const probe = await resolver.probeCandidate("pro");
        assert(!probe.ok, `Ad redirect "${ad.name}" must be REJECTED`);
        assert(
          (probe.reason || "").includes("untrusted hostname"),
          `Rejection reason for "${ad.name}" must cite untrusted hostname (got: "${probe.reason}")`
        );
      }
    }

    // 1.2 Domain Parking & Domain Marketplace Pages (HTTP 200 with > 2000 bytes)
    logger.info("\n--- 1.2: Domain Parking & Marketplace Signature Rejection ---");
    {
      const parkingPages = [
        {
          name: "Sedo Parking Page",
          body: `<html><head><title>Domain for Sale</title></head><body><h1>This domain is for sale!</h1><p>sedoparking</p><a href="/phim/">Anime</a> <div class="tpost">TPostMv</div>${PADDING}</body></html>`,
        },
        {
          name: "ParkingCrew Parked Page",
          body: `<html><head><title>Parked Domain</title></head><body><h1>Domain is parked</h1><p>parkingcrew</p><a href="/phim/">Anime</a> <div class="tpost">TPostMv</div>${PADDING}</body></html>`,
        },
        {
          name: "GoDaddy Marketplace",
          body: `<html><head><title>GoDaddy</title></head><body><h1>godaddy.com/domainsearch</h1><p>Buy this domain</p><a href="/phim/">Anime</a> <div class="tpost">TPostMv</div>${PADDING}</body></html>`,
        },
        {
          name: "Namecheap Marketplace",
          body: `<html><head><title>Namecheap</title></head><body><h1>namecheap.com</h1><p>Domain for sale</p><a href="/phim/">Anime</a> <div class="tpost">TPostMv</div>${PADDING}</body></html>`,
        },
        {
          name: "Dan.com Buy Now Page",
          body: `<html><head><title>Dan.com</title></head><body><h1>dan.com</h1><p>Buy this domain</p><a href="/phim/">Anime</a> <div class="tpost">TPostMv</div>${PADDING}</body></html>`,
        },
        {
          name: "Afternic Marketplace Page",
          body: `<html><head><title>Afternic</title></head><body><h1>afternic</h1><p>This domain is for sale</p><a href="/phim/">Anime</a> <div class="tpost">TPostMv</div>${PADDING}</body></html>`,
        },
      ];

      for (const park of parkingPages) {
        const verifyRes = verifyProviderHtml(park.body);
        assert(!verifyRes.ok, `Parking page "${park.name}" must be REJECTED even with fake /phim/ and tpost markers`);
        assert(
          (verifyRes.reason || "").toLowerCase().includes("parking"),
          `Rejection reason for "${park.name}" must cite domain parking (got: "${verifyRes.reason}")`
        );

        // Also test through probeUrl
        const mockFetch: typeof fetch = async (input) => {
          const res = createMockResponse(200, park.body, input.toString());
          Object.defineProperty(res, "url", { value: input.toString() });
          return res;
        };
        const resolver = new AnimevietsubDomainResolver({ customFetch: mockFetch });
        const probe = await resolver.probeCandidate("tv");
        assert(!probe.ok, `Resolver probeUrl must reject "${park.name}"`);
      }
    }

    // 1.3 Cloudflare Challenge, 5xx Origin Errors, and HTTP Error Statuses
    logger.info("\n--- 1.3: HTTP Error Statuses, Cloudflare Challenges, and 5xx Errors ---");
    {
      const errorScenarios = [
        {
          name: "HTTP 404 Not Found (with > 2000 bytes body)",
          status: 404,
          body: `<html><body><h1>404 Not Found</h1><a href="/phim/">Link</a><div class="tpost">TPost</div>${PADDING}</body></html>`,
          expectedReason: "HTTP 404 error response",
        },
        {
          name: "HTTP 502 Bad Gateway",
          status: 502,
          body: `<html><body><h1>502 Bad Gateway</h1>${PADDING}</body></html>`,
          expectedReason: "HTTP 502 error response",
        },
        {
          name: "HTTP 500 Internal Server Error",
          status: 500,
          body: `<html><body><h1>500 Internal Server Error</h1>${PADDING}</body></html>`,
          expectedReason: "HTTP 500 error response",
        },
        {
          name: "HTTP 503 Service Unavailable",
          status: 503,
          body: `<html><body><h1>503 Service Unavailable</h1>${PADDING}</body></html>`,
          expectedReason: "HTTP 503 error response",
        },
        {
          name: "HTTP 200 Cloudflare Challenge (Just a moment...)",
          status: 200,
          body: `<html><head><title>Just a moment...</title></head><body><div id="cf-browser-verification">Checking your browser</div><a href="/phim/">Link</a><div class="tpost">TPost</div>${PADDING}</body></html>`,
          expectedReason: "Cloudflare challenge",
        },
        {
          name: "HTTP 200 Cloudflare Turnstile Verification",
          status: 200,
          body: `<html><head><title>Verifying</title></head><body><div class="turnstile">turnstile</div><a href="/phim/">Link</a><div class="tpost">TPost</div>${PADDING}</body></html>`,
          expectedReason: "Cloudflare challenge",
        },
        {
          name: "HTTP 200 Origin Server 5xx Page (Lỗi server 5xx)",
          status: 200,
          body: `<html><head><title>Lỗi server 5xx</title></head><body><h1>Origin down</h1><a href="/phim/">Link</a><div class="tpost">TPost</div>${PADDING}</body></html>`,
          expectedReason: "Origin server 5xx",
        },
        {
          name: "HTTP 200 Cloudflare Origin Error (web server is returning an unknown error)",
          status: 200,
          body: `<html><head><title>Web server is returning an unknown error</title></head><body>${PADDING}</body></html>`,
          expectedReason: "Cloudflare origin server down",
        },
      ];

      for (const err of errorScenarios) {
        const mockFetch: typeof fetch = async (input) => {
          const res = createMockResponse(err.status, err.body, input.toString());
          Object.defineProperty(res, "url", { value: input.toString() });
          return res;
        };

        const resolver = new AnimevietsubDomainResolver({ customFetch: mockFetch });
        const probe = await resolver.probeCandidate("site");
        assert(!probe.ok, `Error scenario "${err.name}" must be REJECTED`);
        assert(
          (probe.reason || "").toLowerCase().includes(err.expectedReason.toLowerCase()),
          `Rejection reason for "${err.name}" must include "${err.expectedReason}" (got: "${probe.reason}")`
        );
      }
    }

    // 1.4 Empty, Truncated, and Malformed Bodies
    logger.info("\n--- 1.4: Empty, Truncated, and Incomplete Body Rejections ---");
    {
      const truncatedCases = [
        {
          name: "Empty body (0 bytes)",
          body: "",
          expectedReason: "Empty or invalid response body",
        },
        {
          name: "Whitespace only",
          body: "     \n\t   ",
          expectedReason: "too short",
        },
        {
          name: "Short body (50 bytes)",
          body: "<html><body><a href='/phim/'>tpost</a></body></html>",
          expectedReason: "too short",
        },
        {
          name: "Boundary condition: 1999 bytes (< 2000 threshold) with signatures",
          body: `<a href="/phim/">p</a><div class="tpost">t</div><!-- ${"A".repeat(1940)} -->`,
          expectedReason: "too short",
        },
        {
          name: "2050 bytes missing /phim/ marker",
          body: `<html><body><div class="tpost">card</div>${"<!-- " + "B".repeat(2000) + " -->"}</body></html>`,
          expectedReason: "Missing content signatures",
        },
        {
          name: "2050 bytes missing tpost marker",
          body: `<html><body><a href="/phim/one-piece">Link</a>${"<!-- " + "C".repeat(2000) + " -->"}</body></html>`,
          expectedReason: "Missing content signatures",
        },
      ];

      for (const tc of truncatedCases) {
        const resVerify = verifyProviderHtml(tc.body);
        assert(!resVerify.ok, `Truncated case "${tc.name}" must be REJECTED`);
        assert(
          (resVerify.reason || "").toLowerCase().includes(tc.expectedReason.toLowerCase()),
          `Reason for "${tc.name}" must mention "${tc.expectedReason}" (got: "${resVerify.reason}")`
        );
      }
    }

    // 1.5 Adversarial Multi-Candidate Matrix Fan-Out Simulation
    logger.info("\n--- 1.5: Adversarial Multi-Candidate Fan-Out Matrix ---");
    {
      // Simulation setup:
      // zip: HTTP 404
      // tv: HTTP 502
      // site: 302 ad redirect to click-v4.expclknb.com
      // love: Sedo Parking page
      // fan: Truncated HTML (500 bytes)
      // bz: GENUINE AnimeVietsub page (Valid!)
      // pro: Malicious ad redirect
      // net: 404
      // cc: 404
      const mockMatrix: Record<string, () => Promise<Response>> = {
        "https://animevietsub.zip": async () =>
          createMockResponse(404, "404 Not Found", "https://animevietsub.zip"),
        "https://animevietsub.tv": async () =>
          createMockResponse(502, "502 Bad Gateway", "https://animevietsub.tv"),
        "https://animevietsub.site": async () => {
          const res = createMockResponse(200, "ad landing", "https://click-v4.expclknb.com/track");
          Object.defineProperty(res, "url", { value: "https://click-v4.expclknb.com/track" });
          return res;
        },
        "https://animevietsub.love": async () => {
          const body = `<html><body><h1>Buy this domain - Sedo</h1><p>sedoparking</p>${PADDING}</body></html>`;
          const res = createMockResponse(200, body, "https://animevietsub.love");
          Object.defineProperty(res, "url", { value: "https://animevietsub.love" });
          return res;
        },
        "https://animevietsub.fan": async () =>
          createMockResponse(200, "<html><body>short</body></html>", "https://animevietsub.fan"),
        "https://animevietsub.bz": async () => {
          const res = createMockResponse(200, makeGenuineHtml("https://animevietsub.bz"), "https://animevietsub.bz");
          Object.defineProperty(res, "url", { value: "https://animevietsub.bz" });
          return res;
        },
        "https://animevietsub.pro": async () => {
          const res = createMockResponse(200, "malware redirect", "https://animevietsub.attacker.com");
          Object.defineProperty(res, "url", { value: "https://animevietsub.attacker.com" });
          return res;
        },
        "https://animevietsub.net": async () =>
          createMockResponse(404, "404 Not Found", "https://animevietsub.net"),
        "https://animevietsub.cc": async () =>
          createMockResponse(404, "404 Not Found", "https://animevietsub.cc"),
      };

      const mockFetch: typeof fetch = async (input) => {
        const urlStr = input.toString();
        const handler = mockMatrix[urlStr];
        if (handler) {
          return handler();
        }
        return createMockResponse(404, "Not Found", urlStr);
      };

      const resolver = new AnimevietsubDomainResolver({
        customFetch: mockFetch,
        candidateTlds: ["zip", "tv", "site", "love", "fan", "bz", "pro", "net", "cc"],
      });

      // Clear cache to force fan-out
      resolver.clearCache();

      const resolved = await resolver.resolveDomain(true);
      assertEqual(
        resolved,
        "https://animevietsub.bz",
        "Resolver must navigate past all adversarial candidates (ad redirects, parking, 404, 502) to find genuine .bz"
      );
    }

    // =========================================================================
    // CHALLENGE 2: Race Conditions & 50 Concurrent Single-Flight Deduplication
    // =========================================================================
    logger.info("\n================================================================================");
    logger.info("CHALLENGE 2: RACE CONDITIONS & 50 CONCURRENT SINGLE-FLIGHT DEDUPLICATION");
    logger.info("================================================================================");

    // 2.1 50 Concurrent Calls on Cold Start (Empty DB & Empty Memo)
    logger.info("\n--- 2.1: 50 Concurrent Calls on Cold Start (Fan-Out Deduplication) ---");
    {
      let fetchCount = 0;
      const mockFetch: typeof fetch = async (input) => {
        fetchCount++;
        const urlStr = input.toString();
        // Introduce artificial 30ms latency so all 50 concurrent calls overlap in-flight
        await new Promise((resolve) => setTimeout(resolve, 30));

        if (urlStr === "https://animevietsub.zip") {
          const res = createMockResponse(200, makeGenuineHtml("https://animevietsub.zip"), urlStr);
          Object.defineProperty(res, "url", { value: urlStr });
          return res;
        }
        return createMockResponse(404, "Not Found", urlStr);
      };

      const resolver = new AnimevietsubDomainResolver({
        customFetch: mockFetch,
        candidateTlds: ["zip", "tv", "site", "love", "fan", "bz", "pro", "net", "cc"],
      });
      resolver.clearCache();

      const tStart = performance.now();
      const CONCURRENCY_COUNT = 50;

      // Fire 50 simultaneous calls
      const promises: Promise<string>[] = [];
      for (let i = 0; i < CONCURRENCY_COUNT; i++) {
        promises.push(resolver.resolveDomain(false));
      }

      const results = await Promise.all(promises);
      const tDuration = performance.now() - tStart;

      assertEqual(results.length, CONCURRENCY_COUNT, "All 50 promises must resolve");

      // Verify all 50 results are identical
      const expectedDomain = "https://animevietsub.zip";
      for (let i = 0; i < results.length; i++) {
        assertEqual(
          results[i],
          expectedDomain,
          `Call #${i + 1} must return identical resolved domain "${expectedDomain}"`
        );
      }

      logger.info(
        `50 concurrent cold-start calls completed in ${tDuration.toFixed(2)}ms with ${fetchCount} network probes`
      );

      // Verify single-flight deduplication:
      // If deduplication failed, 50 calls would launch 50 parallel fan-outs (at least 50 * 1 = 50 fetch calls).
      // With single-flight deduplication, only 1 fan-out runs, making <= 4 fetch calls (concurrency=4).
      assert(
        fetchCount <= 4,
        `Single-flight must collapse 50 calls to a single fan-out session (probes=${fetchCount} <= 4)`
      );
      assert(
        tDuration < 500,
        `Single-flight resolution must complete swiftly without queuing storms (took ${tDuration.toFixed(2)}ms)`
      );
    }

    // 2.2 50 Concurrent Calls with forceRefresh = true
    logger.info("\n--- 2.2: 50 Concurrent Calls with forceRefresh = true ---");
    {
      let fetchCount = 0;
      const mockFetch: typeof fetch = async (input) => {
        fetchCount++;
        const urlStr = input.toString();
        await new Promise((resolve) => setTimeout(resolve, 25));

        if (urlStr === "https://animevietsub.tv") {
          const res = createMockResponse(200, makeGenuineHtml("https://animevietsub.tv"), urlStr);
          Object.defineProperty(res, "url", { value: urlStr });
          return res;
        }
        return createMockResponse(404, "Not Found", urlStr);
      };

      const resolver = new AnimevietsubDomainResolver({
        customFetch: mockFetch,
        candidateTlds: ["zip", "tv", "site"],
      });

      // Seed valid domain in SQLite
      SettingsRepository.set("animevietsub_base_url", "https://animevietsub.zip");

      const tStart = performance.now();
      const promises: Promise<string>[] = [];
      for (let i = 0; i < 50; i++) {
        promises.push(resolver.resolveDomain(true)); // Force refresh!
      }

      const results = await Promise.all(promises);
      const tDuration = performance.now() - tStart;

      assertEqual(results.length, 50, "All 50 forceRefresh promises must resolve");
      const winner = results[0];
      for (let i = 0; i < results.length; i++) {
        assertEqual(results[i], winner, `Concurrent forceRefresh call #${i + 1} must match winner "${winner}"`);
      }

      // Single-flight deduplication must prevent 50 parallel fan-outs
      // Candidates = [zip (404), tv (200)] => 2 probes total for 1 fan-out!
      assert(
        fetchCount <= 3,
        `forceRefresh must collapse into single fan-out session (probes=${fetchCount} <= 3)`
      );
      logger.info(
        `50 concurrent forceRefresh calls collapsed to single-flight in ${tDuration.toFixed(2)}ms (${fetchCount} probes)`
      );
    }

    // 2.3 50 Concurrent Calls on Cached Fast-Path Probe
    logger.info("\n--- 2.3: 50 Concurrent Calls on Fast-Path Cached Probe ---");
    {
      let fastPathProbes = 0;
      const mockFetch: typeof fetch = async (input) => {
        fastPathProbes++;
        const urlStr = input.toString();
        await new Promise((resolve) => setTimeout(resolve, 30));
        const res = createMockResponse(200, makeGenuineHtml(urlStr), urlStr);
        Object.defineProperty(res, "url", { value: urlStr });
        return res;
      };

      const resolver = new AnimevietsubDomainResolver({
        customFetch: mockFetch,
      });

      // Seed working cached domain
      SettingsRepository.set("animevietsub_base_url", "https://animevietsub.zip");

      const promises: Promise<string>[] = [];
      for (let i = 0; i < 50; i++) {
        promises.push(resolver.resolveDomain(false));
      }

      const results = await Promise.all(promises);
      assertEqual(results.length, 50, "All 50 fast-path promises must resolve");

      for (let i = 0; i < 50; i++) {
        assertEqual(results[i], "https://animevietsub.zip", `Fast-path result #${i + 1} must match cached domain`);
      }

      // Fast-path probe must be executed EXACTLY ONCE for all 50 concurrent callers
      assertEqual(
        fastPathProbes,
        1,
        `Fast-path single-flight deduplication must execute EXACTLY 1 network probe for 50 concurrent calls (got ${fastPathProbes})`
      );
      logger.info(`50 concurrent fast-path calls collapsed to EXACTLY 1 network probe!`);
    }

    // 2.4 Staggered Concurrency Burst (Mid-Flight Joins)
    logger.info("\n--- 2.4: Staggered Concurrency Burst (Mid-Flight Joins) ---");
    {
      let probeCount = 0;
      const mockFetch: typeof fetch = async (input) => {
        probeCount++;
        const urlStr = input.toString();
        // 350ms latency window to allow all staggered calls to arrive mid-flight
        await new Promise((resolve) => setTimeout(resolve, 350));
        const res = createMockResponse(200, makeGenuineHtml(urlStr), urlStr);
        Object.defineProperty(res, "url", { value: urlStr });
        return res;
      };

      const resolver = new AnimevietsubDomainResolver({
        customFetch: mockFetch,
      });
      resolver.clearCache();
      SettingsRepository.set("animevietsub_base_url", "https://animevietsub.zip");

      // Dispatch 50 calls spaced across 0-100ms window (well within the 350ms flight)
      const staggeredPromises: Promise<string>[] = [];
      for (let i = 0; i < 50; i++) {
        const p = new Promise<string>((resolve) => {
          setTimeout(() => {
            resolve(resolver.resolveDomain(false));
          }, i * 2); // 0ms, 2ms, ... 98ms
        });
        staggeredPromises.push(p);
      }

      const results = await Promise.all(staggeredPromises);
      assertEqual(results.length, 50, "All staggered promises must resolve");

      // Verify all joined the same in-flight probe
      assertEqual(
        probeCount,
        1,
        `Staggered calls arriving mid-flight must join the active single-flight promise (probes=${probeCount})`
      );
      logger.info(`All 50 staggered calls arriving mid-flight joined flight #1 (probes=${probeCount})!`);
    }

    // 2.5 50 Concurrent Calls during Total Failure / Emergency Fallback
    logger.info("\n--- 2.5: 50 Concurrent Calls Under Total Origin Failure ---");
    {
      let failureProbes = 0;
      const mockFetch: typeof fetch = async () => {
        failureProbes++;
        await new Promise((r) => setTimeout(r, 10));
        return createMockResponse(500, "500 Total Outage", "https://animevietsub.zip");
      };

      const resolver = new AnimevietsubDomainResolver({
        customFetch: mockFetch,
        fallbackDomain: "https://animevietsub.emergency.tv",
      });
      resolver.clearCache();

      const promises: Promise<string>[] = [];
      for (let i = 0; i < 50; i++) {
        promises.push(resolver.resolveDomain(false));
      }

      const results = await Promise.all(promises);
      assertEqual(results.length, 50, "All 50 outage calls must resolve to emergency fallback");
      for (let i = 0; i < 50; i++) {
        assertEqual(
          results[i],
          "https://animevietsub.emergency.tv",
          "Must safely return emergency fallback domain"
        );
      }
    }

    // =========================================================================
    // CHALLENGE 3: Cache Invalidation & Corruption Recovery
    // =========================================================================
    logger.info("\n================================================================================");
    logger.info("CHALLENGE 3: CACHE INVALIDATION & CORRUPTION RECOVERY");
    logger.info("================================================================================");

    const healthyOrigin = "https://animevietsub.tv";
    const recoveryMockFetch: typeof fetch = async (input) => {
      const urlStr = input.toString();
      if (urlStr.startsWith(healthyOrigin)) {
        const res = createMockResponse(200, makeGenuineHtml(healthyOrigin), healthyOrigin);
        Object.defineProperty(res, "url", { value: healthyOrigin });
        return res;
      }
      return createMockResponse(404, "Not Found", urlStr);
    };

    // 3.1 Malformed / Non-URL String in SQLite
    logger.info("\n--- 3.1: Corrupted Malformed URL in bot_settings ---");
    {
      const corruptions = [
        "://malformed-url-syntax",
        "ht!tp://invalid-protocol",
        "just-plain-garbage-text",
        "   ",
        "http://",
        "https://",
      ];

      for (const corrupt of corruptions) {
        SettingsRepository.set("animevietsub_base_url", corrupt);

        const resolver = new AnimevietsubDomainResolver({
          customFetch: recoveryMockFetch,
          candidateTlds: ["tv"],
        });

        // getCachedDomain() should not throw
        const cached = resolver.getCachedDomain();
        assertEqual(cached, null, `Malformed URL "${corrupt}" must return null from getCachedDomain()`);

        // resolveDomain() should self-heal without crashing
        const resolved = await resolver.resolveDomain(false);
        assertEqual(resolved, healthyOrigin, `Resolver must heal from malformed value "${corrupt}"`);

        // Database must now contain healthy resolved domain
        const dbVal = SettingsRepository.get("animevietsub_base_url");
        assertEqual(dbVal, healthyOrigin, `Database must be healed from "${corrupt}" to "${healthyOrigin}"`);
      }
    }

    // 3.2 Malicious / Phishing Domain in SQLite
    logger.info("\n--- 3.2: Untrusted / Phishing Domain in bot_settings ---");
    {
      const maliciousDomains = [
        "https://evil-phishing.com",
        "https://animevietsub.hacker.io",
        "https://click-v4.expclknb.com",
        "https://animevietsub.malicious.net",
      ];

      for (const bad of maliciousDomains) {
        SettingsRepository.set("animevietsub_base_url", bad);

        let probedBadDomain = false;
        const spyFetch: typeof fetch = async (input) => {
          const urlStr = input.toString();
          if (urlStr.includes("evil-phishing") || urlStr.includes("hacker") || urlStr.includes("malicious") || urlStr.includes("expclknb")) {
            probedBadDomain = true;
          }
          return recoveryMockFetch(input);
        };

        const resolver = new AnimevietsubDomainResolver({
          customFetch: spyFetch,
          candidateTlds: ["tv"],
        });

        const resolved = await resolver.resolveDomain(false);
        assertEqual(resolved, healthyOrigin, `Resolver must reject untrusted cached domain "${bad}"`);
        assert(!probedBadDomain, `Resolver must NEVER probe untrusted hostname "${bad}" during fast-path`);

        // DB healed
        assertEqual(
          SettingsRepository.get("animevietsub_base_url"),
          healthyOrigin,
          `SQLite bot_settings must be healed to "${healthyOrigin}"`
        );
      }
    }

    // 3.3 Dead / Unreachable Domain in SQLite
    logger.info("\n--- 3.3: Dead / Unreachable Domain in bot_settings ---");
    {
      const deadDomain = "https://animevietsub-dead-999.invalid";
      SettingsRepository.set("animevietsub_base_url", deadDomain);

      const resolver = new AnimevietsubDomainResolver({
        customFetch: recoveryMockFetch,
        candidateTlds: ["tv"],
      });

      const resolved = await resolver.resolveDomain(false);
      assertEqual(resolved, healthyOrigin, "Dead cached domain must trigger fan-out and resolve healthy domain");
      assertEqual(
        SettingsRepository.get("animevietsub_base_url"),
        healthyOrigin,
        "bot_settings must be updated to healthy domain after dead domain failure"
      );
    }

    // 3.4 Ad-Redirecting Domain in SQLite (The animevietsub.pro in cache scenario)
    logger.info("\n--- 3.4: Ad-Redirecting Domain in bot_settings ---");
    {
      SettingsRepository.set("animevietsub_base_url", "https://animevietsub.pro");

      const adSpyFetch: typeof fetch = async (input) => {
        const urlStr = input.toString();
        if (urlStr.startsWith("https://animevietsub.pro")) {
          // Follows redirect to ad network
          const res = createMockResponse(200, "ad", "https://click-v4.expclknb.com/track");
          Object.defineProperty(res, "url", { value: "https://click-v4.expclknb.com/track" });
          return res;
        }
        return recoveryMockFetch(input);
      };

      const resolver = new AnimevietsubDomainResolver({
        customFetch: adSpyFetch,
        candidateTlds: ["tv"],
      });

      const resolved = await resolver.resolveDomain(false);
      assertEqual(
        resolved,
        healthyOrigin,
        "Ad-redirect cached domain must be detected as untrusted and healed to healthy domain"
      );
      assertEqual(
        SettingsRepository.get("animevietsub_base_url"),
        healthyOrigin,
        "SQLite bot_settings must be overwritten with genuine domain"
      );
    }

    // 3.5 Verification Timestamp Persistence & Format Check
    logger.info("\n--- 3.5: Timestamp Persistence & Format Validation ---");
    {
      const verifiedAt = SettingsRepository.get("animevietsub_verified_at");
      assert(verifiedAt !== null, "animevietsub_verified_at must exist in bot_settings");
      const parsedDate = new Date(verifiedAt!);
      assert(!isNaN(parsedDate.getTime()), `animevietsub_verified_at must be valid ISO date (got "${verifiedAt}")`);
      const ageMs = Date.now() - parsedDate.getTime();
      assert(ageMs < 10000, `Verified timestamp must be fresh (< 10s old, was ${ageMs}ms)`);
    }

    // =========================================================================
    // CHALLENGE 4: High-Throughput In-Memory Memoization Stress
    // =========================================================================
    logger.info("\n================================================================================");
    logger.info("CHALLENGE 4: IN-MEMORY MEMOIZATION & ZERO-IO THROUGHPUT");
    logger.info("================================================================================");
    {
      let fetchCalls = 0;
      const resolver = new AnimevietsubDomainResolver({
        customFetch: async (input) => {
          fetchCalls++;
          const res = createMockResponse(200, makeGenuineHtml("https://animevietsub.tv"), "https://animevietsub.tv");
          Object.defineProperty(res, "url", { value: "https://animevietsub.tv" });
          return res;
        },
        candidateTlds: ["tv"],
      });

      // Warm up resolution
      const initial = await resolver.resolveDomain(false);
      assertEqual(initial, "https://animevietsub.tv", "Initial resolution must succeed");
      assertEqual(fetchCalls, 1, "Initial resolution must make 1 fetch call");

      // Now call getCachedDomain() 1,000 times synchronously
      const tMemoStart = performance.now();
      for (let i = 0; i < 1000; i++) {
        const domain = resolver.getCachedDomain();
        if (domain !== "https://animevietsub.tv") {
          throw new Error(`Memoized domain mismatch at #${i}`);
        }
      }
      const tMemoDuration = performance.now() - tMemoStart;
      assertEqual(fetchCalls, 1, "Zero additional network calls during 1,000 getCachedDomain() calls");
      logger.info(`1,000 getCachedDomain() calls completed in ${tMemoDuration.toFixed(2)}ms (< 0.01ms/call)`);
      assert(tMemoDuration < 50, `1,000 memoized calls must complete in < 50ms (took ${tMemoDuration.toFixed(2)}ms)`);
    }

  } finally {
    // =========================================================================
    // CLEANUP & TEARDOWN
    // =========================================================================
    logger.info("\n================================================================================");
    logger.info("CLEANUP & TEARDOWN");
    logger.info("================================================================================");
    if (originalBaseUrl) {
      SettingsRepository.set("animevietsub_base_url", originalBaseUrl);
    } else {
      SettingsRepository.delete("animevietsub_base_url");
    }

    if (originalVerifiedAt) {
      SettingsRepository.set("animevietsub_verified_at", originalVerifiedAt);
    } else {
      SettingsRepository.delete("animevietsub_verified_at");
    }

    logger.info("Restored pre-challenge bot_settings state successfully.");
  }

  const totalDuration = ((performance.now() - startTime) / 1000).toFixed(3);
  logger.info("\n================================================================================");
  if (failedCount === 0) {
    logger.success(`ALL EMPIRICAL ADVERSARIAL CHALLENGES PASSED! (${passedCount} passed, 0 failed)`);
  } else {
    logger.error(`ADVERSARIAL CHALLENGES FAILED: ${failedCount} failures!`);
    for (const f of failureDetails) {
      logger.error(`  -> ${f}`);
    }
  }
  logger.info(`Total Execution Time: ${totalDuration}s`);
  logger.info("================================================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

// Execute adversarial suite
runAdversarialDomainResolverTests().catch((err) => {
  logger.error("Adversarial Domain Resolver Suite failed with unhandled error:", err);
  process.exit(1);
});
