import { getDatabase } from "../src/database/db";
import { SettingsRepository } from "../src/database/repositories/settingsRepo";
import {
  AnimevietsubDomainResolver,
  matchesLabel,
  verifyProviderHtml,
  ANIMEVIETSUB_CANDIDATE_TLDS,
} from "../src/anime/domainResolver";
import { logger } from "../src/utils/logger";
import { performance } from "perf_hooks";

// --- Assertion Utilities ---
let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failedCount++;
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
    logger.error(
      `[FAIL] ${message} | Expected: ${JSON.stringify(expected)}, Received: ${JSON.stringify(actual)}`
    );
    throw new Error(`Assertion Failed: ${message} (Expected ${expected}, got ${actual})`);
  }
  passedCount++;
  logger.success(`[PASS] ${message}`);
}

async function runDomainResolverTests() {
  const startTime = performance.now();
  const RUN_ID = Math.random().toString(36).substring(2, 8);
  logger.info("=======================================================");
  logger.info(`STARTING DOMAIN RESOLVER TEST SUITE [Run ID: ${RUN_ID}]`);
  logger.info("=======================================================");

  // Ensure database initialized
  getDatabase();

  // Backup existing settings for clean teardown
  const originalBaseUrl = SettingsRepository.get("animevietsub_base_url");
  const originalVerifiedAt = SettingsRepository.get("animevietsub_verified_at");

  try {
    // =========================================================================
    // PHASE 1: Hostname Label Validation & Security Filtering (matchesLabel)
    // =========================================================================
    logger.info("\n--- PHASE 1: Hostname Label Validation & Security Filtering ---");

    // 1.1 Valid apex domains
    assert(matchesLabel("animevietsub.zip", "animevietsub"), "animevietsub.zip must be accepted");
    assert(matchesLabel("animevietsub.tv", "animevietsub"), "animevietsub.tv must be accepted");
    assert(matchesLabel("animevietsub.site", "animevietsub"), "animevietsub.site must be accepted");
    assert(matchesLabel("animevietsub.love", "animevietsub"), "animevietsub.love must be accepted");
    assert(matchesLabel("animevietsub.fan", "animevietsub"), "animevietsub.fan must be accepted");
    assert(matchesLabel("animevietsub.bz", "animevietsub"), "animevietsub.bz must be accepted");
    assert(matchesLabel("animevietsub.cc", "animevietsub"), "animevietsub.cc must be accepted");
    assert(matchesLabel("animevietsub.net", "animevietsub"), "animevietsub.net must be accepted");
    assert(!matchesLabel("animevietsubs.com", "animevietsub"), "Fake domain animevietsubs.com must be REJECTED");

    // 1.2 Valid subdomains
    assert(matchesLabel("cdn.animevietsub.zip", "animevietsub"), "cdn.animevietsub.zip must be accepted");
    assert(matchesLabel("www.animevietsub.zip", "animevietsub"), "www.animevietsub.zip must be accepted");
    assert(matchesLabel("static.media.animevietsub.tv", "animevietsub"), "Nested subdomain must be accepted");

    // 1.3 Case insensitivity
    assert(matchesLabel("ANIMEVIETSUB.ZIP", "animevietsub"), "Uppercase hostname must be normalized and accepted");
    assert(matchesLabel("AnimeVietSub.tv", "AnimeVietSub"), "Mixed-case hostname and label must match");

    // 1.4 Malicious redirect & ad network domain rejection (e.g. animevietsub.pro -> click-v4.expclknb.com)
    assert(!matchesLabel("click-v4.expclknb.com", "animevietsub"), "Ad network click-v4.expclknb.com must be REJECTED");
    assert(!matchesLabel("parkingcrew.net", "animevietsub"), "Parking domain parkingcrew.net must be REJECTED");
    assert(!matchesLabel("sedoparking.com", "animevietsub"), "Parking domain sedoparking.com must be REJECTED");

    // 1.5 Attacker subdomain hijacking & typo-squatting
    assert(!matchesLabel("animevietsub.attacker.com", "animevietsub"), "Subdomain attack animevietsub.attacker.com must be REJECTED");
    assert(!matchesLabel("fake-animevietsub.zip", "animevietsub"), "Hyphenated fake-animevietsub.zip must be REJECTED");
    assert(!matchesLabel("animevietsubxyz.tv", "animevietsub"), "Suffix variation animevietsubxyz.tv must be REJECTED");
    assert(!matchesLabel("myanimevietsub.net", "animevietsub"), "Prefix variation myanimevietsub.net must be REJECTED");

    // 1.6 Invalid / malformed hostnames
    assert(!matchesLabel("", "animevietsub"), "Empty hostname must be REJECTED");
    assert(!matchesLabel("localhost", "animevietsub"), "Single-label hostname localhost must be REJECTED");
    assert(!matchesLabel("127.0.0.1", "animevietsub"), "IPv4 address must be REJECTED");

    // =========================================================================
    // PHASE 2: Content Signature & Anti-False-Positive Filtering (verifyProviderHtml)
    // =========================================================================
    logger.info("\n--- PHASE 2: Content Signature & Anti-False-Positive Filtering ---");

    // 2.1 Minimum length guard (< 2000 bytes)
    const shortHtml = "<html><body><a href='/phim/test'>tpost</a></body></html>";
    const resShort = verifyProviderHtml(shortHtml);
    assert(!resShort.ok, "Short HTML (< 2000 bytes) must be rejected");
    assert((resShort.reason || "").includes("short"), "Rejection reason must mention length/short");

    // 2.2 Missing /phim/ marker
    const padding = "<!-- " + "x".repeat(2500) + " -->";
    const noPhimHtml = `<html><body><div class="TPostMv">Card Content</div>${padding}</body></html>`;
    const resNoPhim = verifyProviderHtml(noPhimHtml);
    assert(!resNoPhim.ok, "HTML missing '/phim/' must be rejected");

    // 2.3 Missing tpost marker
    const noTpostHtml = `<html><body><a href="/phim/one-piece/">One Piece</a>${padding}</body></html>`;
    const resNoTpost = verifyProviderHtml(noTpostHtml);
    assert(!resNoTpost.ok, "HTML missing 'tpost' class must be rejected");

    // 2.4 Cloudflare Challenge / Turnstile detection
    const cfChallengeHtml = `
      <html>
        <head><title>Just a moment...</title></head>
        <body>
          <div id="cf-browser-verification">Checking your browser before accessing animevietsub.zip</div>
          <div class="turnstile-wrapper"></div>
          <a href="/phim/">Link</a> <div class="tpost">Card</div>
          ${padding}
        </body>
      </html>
    `;
    const resCf = verifyProviderHtml(cfChallengeHtml);
    assert(!resCf.ok, "Cloudflare challenge page must be rejected");
    assert((resCf.reason || "").toLowerCase().includes("cloudflare"), "Rejection reason must identify Cloudflare challenge");

    // 2.5 Origin Server 5xx error page
    const server5xxHtml = `
      <html>
        <head><title>Lỗi server 5xx</title></head>
        <body>
          <h1>Lỗi kết nối máy chủ gốc (521 / 502)</h1>
          <a href="/phim/">Link</a> <div class="tpost">Card</div>
          ${padding}
        </body>
      </html>
    `;
    const res5xx = verifyProviderHtml(server5xxHtml);
    assert(!res5xx.ok, "5xx origin server error page must be rejected");

    // 2.6 Domain Parking / For Sale page
    const parkingHtml = `
      <html>
        <head><title>Buy this domain - Sedo</title></head>
        <body>
          <h1>This domain is for sale!</h1>
          <a href="/phim/">Link</a> <div class="tpost">Card</div>
          ${padding}
        </body>
      </html>
    `;
    const resParking = verifyProviderHtml(parkingHtml);
    assert(!resParking.ok, "Domain parking page must be rejected");

    // 2.7 Genuine AnimeVietsub HTML (Valid)
    const validHtml = `
      <!DOCTYPE html>
      <html lang="vi">
        <head><title>Anime Vietsub Online - Xem Phim Nhanh</title></head>
        <body>
          <div class="MovieList">
            <div class="TPostMv">
              <a href="https://animevietsub.zip/phim/one-piece-dao-hai-tac-a1/" title="One Piece">
                <span class="mli-eps">TẬP 1115</span>
              </a>
            </div>
          </div>
          ${padding}
        </body>
      </html>
    `;
    const resValid = verifyProviderHtml(validHtml);
    assert(resValid.ok, "Genuine AnimeVietsub HTML must be accepted");

    // 2.8 Case-insensitive signature check
    const uppercaseHtml = validHtml.replace(/TPostMv/g, "TPOSTMV").replace(/\/phim\//g, "/PHIM/");
    const resUpper = verifyProviderHtml(uppercaseHtml);
    assert(resUpper.ok, "Uppercase signatures must be accepted (case-insensitive)");

    // =========================================================================
    // PHASE 3: Fast-Path Probe with Valid & Invalid Cached Domains
    // =========================================================================
    logger.info("\n--- PHASE 3: Fast-Path Probe with Valid & Invalid Cached Domains ---");

    const resolver = new AnimevietsubDomainResolver();

    // 3.1 Fast-Path with Valid Cached Domain
    // Set a known working domain in bot_settings
    SettingsRepository.set("animevietsub_base_url", "https://animevietsub.zip");
    SettingsRepository.set("animevietsub_verified_at", new Date().toISOString());

    const tFastStart = performance.now();
    const resolvedFast = await resolver.resolveDomain(false);
    const tFastDuration = performance.now() - tFastStart;

    assert(
      resolvedFast.startsWith("https://animevietsub"),
      `Fast-path resolved domain must be valid origin (got ${resolvedFast})`
    );
    logger.info(`Fast-path probe completed in ${tFastDuration.toFixed(2)}ms -> ${resolvedFast}`);
    assert(tFastDuration < 3000, `Fast-path probe must complete in < 3000ms (took ${tFastDuration.toFixed(2)}ms)`);

    // 3.2 Fast-Path Fallback on Invalid Cached Domain
    // Inject a simulated dead/invalid URL
    const deadDomain = `https://animevietsub-dead-${RUN_ID}.invalid`;
    SettingsRepository.set("animevietsub_base_url", deadDomain);

    const tFallbackStart = performance.now();
    const resolvedAfterDead = await resolver.resolveDomain(false);
    const tFallbackDuration = performance.now() - tFallbackStart;

    assert(
      resolvedAfterDead !== deadDomain,
      "Resolver must NOT return the dead cached domain"
    );
    assert(
      resolvedAfterDead.startsWith("https://animevietsub"),
      `Resolver must fall back to a working candidate domain (got ${resolvedAfterDead})`
    );
    logger.info(
      `Invalid cache fallback completed in ${tFallbackDuration.toFixed(2)}ms -> ${resolvedAfterDead}`
    );

    // Verify bot_settings was updated with healthy domain
    const updatedSetting = SettingsRepository.get("animevietsub_base_url");
    assertEqual(
      updatedSetting,
      resolvedAfterDead,
      "bot_settings must be updated to the healthy resolved domain"
    );

    // 3.3 Fast-Path with Empty / Missing Cache
    SettingsRepository.delete("animevietsub_base_url");
    SettingsRepository.delete("animevietsub_verified_at");

    const resolvedEmpty = await resolver.resolveDomain(false);
    assert(
      resolvedEmpty.startsWith("https://animevietsub"),
      `Resolver must successfully resolve when cache is empty (got ${resolvedEmpty})`
    );
    assertEqual(
      SettingsRepository.get("animevietsub_base_url"),
      resolvedEmpty,
      "bot_settings must be populated after resolving with empty cache"
    );

    // =========================================================================
    // PHASE 4: Candidate TLD Probe & Priority Ordering
    // =========================================================================
    logger.info("\n--- PHASE 4: Candidate TLD Probe & Priority Ordering ---");

    // 4.1 Verify candidate TLD inventory and priority order
    const expectedTlds = [
      "zip",
      "tv",
      "site",
      "love",
      "fan",
      "bz",
      "pro",
      "net",
      "cc",
    ];
    assertEqual(
      ANIMEVIETSUB_CANDIDATE_TLDS.length,
      expectedTlds.length,
      "Candidate TLDs count must match specification"
    );
    for (let i = 0; i < expectedTlds.length; i++) {
      assertEqual(
        ANIMEVIETSUB_CANDIDATE_TLDS[i],
        expectedTlds[i],
        `Candidate TLD index ${i} must be '${expectedTlds[i]}'`
      );
    }

    // 4.2 Fan-out candidate origins builder
    const candidateUrls = ANIMEVIETSUB_CANDIDATE_TLDS.map((tld) => `https://animevietsub.${tld}`);
    assert(candidateUrls[0] === "https://animevietsub.zip", "Primary candidate must be https://animevietsub.zip");
    assert(candidateUrls[1] === "https://animevietsub.tv", "Secondary candidate must be https://animevietsub.tv");

    // =========================================================================
    // PHASE 5: SQLite Cache Persistence & Force Refresh (resolveDomain(true))
    // =========================================================================
    logger.info("\n--- PHASE 5: SQLite Persistence & Force Refresh ---");

    // 5.1 Force refresh bypasses memoization and cache
    SettingsRepository.set("animevietsub_base_url", "https://animevietsub.site"); // Stale value
    const forceResolved = await resolver.resolveDomain(true);
    assert(
      forceResolved.startsWith("https://animevietsub"),
      "Force refresh must resolve to a valid active domain"
    );

    // 5.2 Verify updated_at timestamp in bot_settings
    const verifiedAtStr = SettingsRepository.get("animevietsub_verified_at");
    assert(verifiedAtStr !== null, "animevietsub_verified_at must be populated in bot_settings");
    const verifiedTimestamp = new Date(verifiedAtStr!).getTime();
    assert(!isNaN(verifiedTimestamp), "animevietsub_verified_at must be a valid timestamp");
    const now = Date.now();
    assert(
      Math.abs(now - verifiedTimestamp) < 60000,
      `Verified timestamp must be recent (< 60s ago, delta: ${Math.abs(now - verifiedTimestamp)}ms)`
    );

    // =========================================================================
    // PHASE 6: Live End-to-End Network Probe Verification
    // =========================================================================
    logger.info("\n--- PHASE 6: Live End-to-End Network Probe Verification ---");

    const liveDomain = await resolver.resolveDomain(true);
    logger.info(`Live resolved domain: ${liveDomain}`);
    assert(liveDomain.startsWith("https://"), "Live domain must use HTTPS protocol");
    assert(
      matchesLabel(new URL(liveDomain).hostname, "animevietsub"),
      "Live domain hostname must match registrable label 'animevietsub'"
    );

  } finally {
    // =========================================================================
    // PHASE 7: Teardown & Database State Restoration
    // =========================================================================
    logger.info("\n--- CLEANUP & TEARDOWN ---");
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

    logger.info("Restored pre-test bot_settings state successfully.");
  }

  const totalTime = ((performance.now() - startTime) / 1000).toFixed(3);
  logger.info("\n=======================================================");
  if (failedCount === 0) {
    logger.success("ALL DOMAIN RESOLVER TESTS PASSED!");
  } else {
    logger.error(`DOMAIN RESOLVER TESTS FAILED: ${failedCount} failures!`);
  }
  logger.info(`Total Tests: ${passedCount} passed, ${failedCount} failed`);
  logger.info(`Execution Time: ${totalTime}s`);
  logger.info("=======================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

// Execute test suite
runDomainResolverTests().catch((err) => {
  logger.error("Domain Resolver Test Suite Failed with unhandled error:", err);
  process.exit(1);
});
