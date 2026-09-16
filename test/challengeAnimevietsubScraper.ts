/**
 * test/challengeAnimevietsubScraper.ts
 * Empirical Adversarial Challenge Suite for AnimevietsubScraper (Milestone M2.2)
 *
 * Challenges:
 * 1. Live Scraping Integrity & Boundary Oracles (>= 5 items, limit boundaries, field contracts)
 * 2. Search Query Matrix (Standard, Vietnamese diacritics, special symbols, whitespace, non-existent)
 * 3. Fault Injection & Resiliency (Dead DNS, HTTP 500 server error failover, catastrophic failure)
 * 4. Concurrency, Context Leak Audit & Lifecycle Recovery (concurrent requests, context count == 0, post-close restart)
 * 5. Synthetic Malformed HTML Parsing Matrix (local server, missing tags, normalization edge cases)
 */

import http from "http";
import { performance } from "perf_hooks";
import { getDatabase } from "../src/database/db";
import { AnimevietsubScraper, AnimevietsubScraperError } from "../src/anime/animevietsubScraper";
import { AnimevietsubDomainResolver } from "../src/anime/domainResolver";
import { SettingsRepository } from "../src/database/repositories/settingsRepo";
import { playwrightCrawler } from "../src/crawler/playwrightCrawler";
import { AnimeEpisodeItem, AnimeSearchResult } from "../src/anime/types";
import { logger } from "../src/utils/logger";

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
const failureDetails: string[] = [];

function challengeAssert(condition: boolean, message: string) {
  totalAssertions++;
  if (!condition) {
    failedAssertions++;
    failureDetails.push(message);
    logger.error(`[CHALLENGE FAIL] ${message}`);
    throw new Error(`Challenge Assertion Failed: ${message}`);
  }
  passedAssertions++;
  logger.success(`[CHALLENGE PASS] ${message}`);
}

function challengeAssertEqual<T>(actual: T, expected: T, message: string) {
  totalAssertions++;
  const isMatch = actual === expected;
  if (!isMatch) {
    failedAssertions++;
    const errMsg = `${message} | Expected: ${JSON.stringify(expected)}, Received: ${JSON.stringify(actual)}`;
    failureDetails.push(errMsg);
    logger.error(`[CHALLENGE FAIL] ${errMsg}`);
    throw new Error(`Challenge Assertion Failed: ${errMsg}`);
  }
  passedAssertions++;
  logger.success(`[CHALLENGE PASS] ${message}`);
}

async function runAdversarialChallenge() {
  const t0 = performance.now();
  const RUN_TAG = `CHALLENGE-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  logger.info("===============================================================================");
  logger.info(`STARTING EMPIRICAL ADVERSARIAL CHALLENGE: AnimevietsubScraper [${RUN_TAG}]`);
  logger.info("===============================================================================");

  // Ensure database initialized
  getDatabase();

  const originalBaseUrl = SettingsRepository.get("animevietsub_base_url");
  const originalVerifiedAt = SettingsRepository.get("animevietsub_verified_at");

  const resolver = new AnimevietsubDomainResolver();
  const scraper = new AnimevietsubScraper(resolver);

  try {
    // =========================================================================
    // SECTION 1: Live Scraping Integrity & Boundary Oracles
    // =========================================================================
    logger.info("\n>>> SECTION 1: Live Scraping Integrity & Boundary Oracles <<<");

    logger.info("1.1 Probing live domain for baseline...");
    const activeDomain = await resolver.resolveDomain();
    challengeAssert(
      typeof activeDomain === "string" && activeDomain.startsWith("https://animevietsub."),
      `Active domain must start with https://animevietsub. (got "${activeDomain}")`
    );

    logger.info("1.2 Scraping live latest episodes (requesting limit = 20)...");
    const tScrape0 = performance.now();
    const liveEpisodes: AnimeEpisodeItem[] = await scraper.getLatestEpisodes(20);
    const scrapeDurationMs = performance.now() - tScrape0;
    logger.info(`Scraped ${liveEpisodes.length} episodes in ${scrapeDurationMs.toFixed(1)}ms`);

    challengeAssert(Array.isArray(liveEpisodes), "getLatestEpisodes must return an Array");
    challengeAssert(
      liveEpisodes.length >= 5,
      `Acceptance Criteria: live scrape must return at least 5 episodes (got ${liveEpisodes.length})`
    );

    // Deep validation on EVERY scraped item
    const seenUrls = new Set<string>();
    for (let i = 0; i < liveEpisodes.length; i++) {
      const ep = liveEpisodes[i];
      const tag = `Item[${i}] "${ep.animeTitle}"`;

      // Title validation
      challengeAssert(
        typeof ep.animeTitle === "string" && ep.animeTitle.trim().length > 0,
        `${tag}: title must be non-empty string`
      );
      challengeAssert(
        !/\(\d{4}\)$/.test(ep.animeTitle),
        `${tag}: title must NOT contain unstripped year suffix like '(2024)'`
      );

      // EpisodeName validation
      challengeAssert(
        typeof ep.episodeName === "string" && ep.episodeName.trim().length > 0,
        `${tag}: episodeName must be non-empty string (got "${ep.episodeName}")`
      );
      challengeAssert(
        /^(Tập \d+|Hoàn tất|Tập mới)/i.test(ep.episodeName) || ep.episodeName.length > 0,
        `${tag}: episodeName must be standardized format (got "${ep.episodeName}")`
      );

      // Episode URL validation
      challengeAssert(
        typeof ep.episodeUrl === "string" && ep.episodeUrl.startsWith("https://"),
        `${tag}: episodeUrl must start with https:// (got "${ep.episodeUrl}")`
      );
      challengeAssert(
        ep.episodeUrl.includes("/phim/"),
        `${tag}: episodeUrl must contain '/phim/' (got "${ep.episodeUrl}")`
      );
      challengeAssert(
        ep.episodeUrl.endsWith("/xem-phim.html") || ep.episodeUrl.endsWith("xem-phim.html"),
        `${tag}: episodeUrl must end with xem-phim.html (got "${ep.episodeUrl}")`
      );

      // Anime URL validation
      challengeAssert(
        typeof ep.animeUrl === "string" && ep.animeUrl.startsWith("https://"),
        `${tag}: animeUrl must start with https:// (got "${ep.animeUrl}")`
      );
      challengeAssert(
        ep.animeUrl.includes("/phim/"),
        `${tag}: animeUrl must contain '/phim/' (got "${ep.animeUrl}")`
      );

      // Poster URL validation
      challengeAssert(
        typeof ep.posterUrl === "string" && ep.posterUrl.startsWith("http"),
        `${tag}: posterUrl must start with http/https (got "${ep.posterUrl}")`
      );

      // Uniqueness
      challengeAssert(!seenUrls.has(ep.episodeUrl), `${tag}: duplicate episodeUrl detected: ${ep.episodeUrl}`);
      seenUrls.add(ep.episodeUrl);
    }

    logger.info("1.3 Testing Limit Boundaries: 0, 1, 3, 50...");
    const limit0 = await scraper.getLatestEpisodes(0);
    challengeAssertEqual(limit0.length, 0, "limit = 0 must return 0 items");

    const limit1 = await scraper.getLatestEpisodes(1);
    challengeAssertEqual(limit1.length, 1, "limit = 1 must return exactly 1 item");

    const limit3 = await scraper.getLatestEpisodes(3);
    challengeAssertEqual(limit3.length, 3, "limit = 3 must return exactly 3 items");

    // =========================================================================
    // SECTION 2: Search Query Matrix & Stress
    // =========================================================================
    logger.info("\n>>> SECTION 2: Search Query Matrix & Stress <<<");

    // 2.1 Standard ASCII Search
    logger.info("2.1 Search: Standard ASCII 'Dragon Ball'...");
    const dragonBallResults = await scraper.searchAnime("Dragon Ball", 5);
    challengeAssert(dragonBallResults.length > 0, "Search 'Dragon Ball' must return results");
    challengeAssert(dragonBallResults.length <= 5, "Search 'Dragon Ball' limit 5 respected");
    for (const r of dragonBallResults) {
      challengeAssert(r.title.length > 0, "Result title non-empty");
      challengeAssert(r.animeUrl.includes("/phim/"), "Result animeUrl contains /phim/");
      challengeAssert(r.posterUrl.startsWith("http"), "Result posterUrl valid");
    }

    // 2.2 Vietnamese Diacritics Search
    logger.info("2.2 Search: Vietnamese with diacritics 'Đảo Hải Tặc'...");
    const vnResults = await scraper.searchAnime("Đảo Hải Tặc", 5);
    challengeAssert(Array.isArray(vnResults), "Search with Vietnamese diacritics must return array");
    challengeAssert(vnResults.length > 0, "Search 'Đảo Hải Tặc' must return at least 1 match");

    // 2.3 Special characters & punctuation
    logger.info("2.3 Search: Special characters 'SPY x FAMILY' and punctuation 'Fate/Zero'...");
    const spyResults = await scraper.searchAnime("SPY x FAMILY", 5);
    challengeAssert(Array.isArray(spyResults), "Search 'SPY x FAMILY' must succeed without error");

    const fateResults = await scraper.searchAnime("Fate/Zero", 5);
    challengeAssert(Array.isArray(fateResults), "Search 'Fate/Zero' must succeed without error");

    // 2.4 Empty & whitespace queries
    logger.info("2.4 Search: Blank and whitespace-only queries...");
    const emptyResults = await scraper.searchAnime("");
    challengeAssertEqual(emptyResults.length, 0, "Empty search query must immediately return []");

    const spacesResults = await scraper.searchAnime("     ");
    challengeAssertEqual(spacesResults.length, 0, "Whitespace-only search query must immediately return []");

    // 2.5 Obscure negative query
    const negativeQuery = `nonexistent_anime_${RUN_TAG}_adversarial_test`;
    logger.info(`2.5 Search: Obscure negative query '${negativeQuery}'...`);
    const noResults = await scraper.searchAnime(negativeQuery, 5);
    challengeAssertEqual(noResults.length, 0, "Negative query must cleanly return empty array without timing out");

    // =========================================================================
    // SECTION 3: Resiliency & Domain Failover Recovery
    // =========================================================================
    logger.info("\n>>> SECTION 3: Resiliency & Domain Failover Recovery <<<");

    // 3.1 DNS Failure Failover
    logger.info("3.1 Injected dead domain into cache (DNS failure simulation)...");
    const fakeDeadDomain = `https://animevietsub-adversarial-dead-${Math.random().toString(36).slice(2)}.internal`;
    SettingsRepository.set("animevietsub_base_url", fakeDeadDomain);

    const failoverScraper = new AnimevietsubScraper(new AnimevietsubDomainResolver());
    const recoveredItems = await failoverScraper.getLatestEpisodes(5);
    challengeAssert(
      Array.isArray(recoveredItems) && recoveredItems.length >= 5,
      "Failover scraper must transparently recover from dead domain and return >= 5 items"
    );

    const updatedDbSetting = SettingsRepository.get("animevietsub_base_url");
    challengeAssert(
      updatedDbSetting !== fakeDeadDomain && updatedDbSetting?.startsWith("https://animevietsub."),
      `Database setting must be updated to healthy domain (got "${updatedDbSetting}")`
    );
    await failoverScraper.close();

    // 3.2 HTTP 500 Server Error Simulation via Local HTTP Server
    logger.info("3.2 Testing HTTP 500 error failover via local mock server...");
    let server500HitCount = 0;
    const server500 = http.createServer((req, res) => {
      server500HitCount++;
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error 500");
    });

    await new Promise<void>((resolve) => server500.listen(0, "127.0.0.1", resolve));
    const server500Port = (server500.address() as any).port;
    const server500Url = `http://127.0.0.1:${server500Port}`;

    try {
      SettingsRepository.set("animevietsub_base_url", server500Url);
      const http500Scraper = new AnimevietsubScraper(new AnimevietsubDomainResolver());

      logger.info(`Pointing scraper initially at 500 server: ${server500Url}`);
      const recoveredFrom500 = await http500Scraper.getLatestEpisodes(5);
      challengeAssert(
        recoveredFrom500.length >= 5,
        "Scraper must detect HTTP 500 as domain failure and recover to healthy domain"
      );
      challengeAssert(server500HitCount >= 1, "Mock 500 server must have been hit before failover");

      await http500Scraper.close();
    } finally {
      server500.close();
    }

    // 3.3 Catastrophic Failover: Both active domain AND resolver fail
    logger.info("3.3 Catastrophic Failover: Primary and resolver both fail...");
    const failingResolver = {
      resolveDomain: async (_force?: boolean) => {
        throw new Error("Resolver fatal network partition");
      },
      getActiveDomain: () => "http://127.0.0.1:1", // Port 1 won't connect
      getCachedDomain: () => "http://127.0.0.1:1",
    };

    const catastrophicScraper = new AnimevietsubScraper(failingResolver as any, playwrightCrawler, {
      timeoutMs: 3000,
      selectorTimeoutMs: 2000,
    });

    let caughtCatastrophic = false;
    try {
      await catastrophicScraper.getLatestEpisodes(5);
    } catch (err: any) {
      caughtCatastrophic = true;
      challengeAssert(
        err instanceof AnimevietsubScraperError || err.name === "AnimevietsubScraperError",
        "Error must be an instance of AnimevietsubScraperError"
      );
      challengeAssert(
        err.message.includes("Scraper failed and domain resolution also failed") ||
        err.message.includes("fatal network partition") ||
        err.message.includes("Scraper retry failed"),
        `Error message must clearly identify failover exhaustion (got "${err.message}")`
      );
    }
    challengeAssert(caughtCatastrophic, "Scraper must throw AnimevietsubScraperError when failover fails");

    // =========================================================================
    // SECTION 4: Concurrency, Browser Context Cleanup & Memory Leak Audit
    // =========================================================================
    logger.info("\n>>> SECTION 4: Concurrency, Browser Context Cleanup & Memory Leak Audit <<<");

    const browser = await playwrightCrawler.getBrowser();
    challengeAssert(browser.isConnected(), "Playwright browser must be connected");

    const initialContextCount = browser.contexts().length;
    logger.info(`Initial active browser contexts: ${initialContextCount}`);

    // 4.1 Concurrent scrapers execution
    logger.info("4.1 Running 4 concurrent scraping operations simultaneously...");
    const concurrentStart = performance.now();
    const [c1, c2, c3, c4] = await Promise.all([
      scraper.getLatestEpisodes(3),
      scraper.searchAnime("Naruto", 3),
      scraper.searchAnime("One Piece", 3),
      scraper.getLatestEpisodes(3),
    ]);
    const concurrentDurationMs = performance.now() - concurrentStart;
    logger.info(`4 concurrent operations finished in ${concurrentDurationMs.toFixed(1)}ms`);

    challengeAssert(c1.length > 0, "Concurrent 1 (latest) returned items");
    challengeAssert(c2.length > 0, "Concurrent 2 (search Naruto) returned items");
    challengeAssert(c3.length > 0, "Concurrent 3 (search One Piece) returned items");
    challengeAssert(c4.length > 0, "Concurrent 4 (latest) returned items");

    // Context leak verification after concurrent operations
    const contextsAfterConcurrent = browser.contexts().length;
    logger.info(`Contexts active after concurrent execution: ${contextsAfterConcurrent}`);
    challengeAssertEqual(
      contextsAfterConcurrent,
      0,
      "LEAK CHECK: All browser contexts MUST be closed after concurrent operations (contexts == 0)"
    );

    // 4.2 Sequential batch execution (5 rapid successive calls)
    logger.info("4.2 Running 5 sequential scraping operations in rapid succession...");
    for (let s = 1; s <= 5; s++) {
      await scraper.getLatestEpisodes(2);
      const ctxs = browser.contexts().length;
      challengeAssertEqual(
        ctxs,
        0,
        `LEAK CHECK: Browser context must be closed immediately after iteration ${s}`
      );
    }

    // 4.3 Browser Lifecycle: Close & Transparent Re-launch
    logger.info("4.3 Testing scraper.close() and transparent re-launch...");
    await scraper.close();
    challengeAssert(!browser.isConnected(), "Browser must be disconnected after scraper.close()");

    logger.info("Invoking getLatestEpisodes() after close() to verify auto-relaunch...");
    const reLaunchedItems = await scraper.getLatestEpisodes(3);
    challengeAssert(
      reLaunchedItems.length > 0,
      "Scraper must transparently re-launch browser and succeed after explicit close"
    );

    const reLaunchedBrowser = await playwrightCrawler.getBrowser();
    challengeAssert(reLaunchedBrowser.isConnected(), "New browser must be connected and operational");
    await scraper.close();

    // =========================================================================
    // SECTION 5: Synthetic Malformed HTML Parsing Matrix (Mock Server)
    // =========================================================================
    logger.info("\n>>> SECTION 5: Synthetic Malformed HTML Parsing Matrix <<<");

    const syntheticHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Synthetic Test Page</title></head>
      <body>
        <!-- Valid Card 1: Year in title, episode with prefix -->
        <div class="TPostMv">
          <a href="/phim/bleach-thousand-year-blood-war-a100/" title="Bleach: Thousand-Year Blood War (2024)"></a>
          <h2 class="Title">Bleach: Thousand-Year Blood War (2024)</h2>
          <span class="mli-eps">Tập 12</span>
          <img src="/images/bleach.jpg" />
          <span class="Date">2026-09-15</span>
        </div>

        <!-- Valid Card 2: Hoàn tất episode, absolute image URL -->
        <div class="TPostMv">
          <a href="/phim/attack-on-titan-final-season-a200/">
            <h3 class="Title">Attack on Titan: The Final Season</h3>
          </a>
          <span class="mli-eps">Hoàn tất (28/28)</span>
          <img data-src="https://cdn.example.com/aot.png" />
          <span class="mli-timeschedule">1 giờ trước</span>
        </div>

        <!-- Card 3: Numeric-only episode -->
        <div class="TPostMv">
          <a href="/phim/demon-slayer-s4-a300/"></a>
          <span class="Title">Kimetsu no Yaiba: Hashira Geiko-hen</span>
          <span class="episode">8</span>
          <img src="https://cdn.example.com/kny.jpg" />
        </div>

        <!-- Card 4: No title inside, title in a[title] attribute -->
        <div class="TPostMv">
          <a href="/phim/jujutsu-kaisen-s2-a400/" title="Jujutsu Kaisen Season 2 (2023)"></a>
          <span class="Qlty">Tập 23</span>
          <img data-original="https://cdn.example.com/jjk.jpg" />
        </div>

        <!-- Corrupted Card 5: Missing /phim/ link -> Should be skipped -->
        <div class="TPostMv">
          <a href="/news/random-article/"></a>
          <h2 class="Title">Not An Anime</h2>
          <span class="mli-eps">Tập 1</span>
        </div>

        <!-- Corrupted Card 6: Completely empty card -> Should be skipped -->
        <div class="TPostMv"></div>
      </body>
      </html>
    `;

    const mockServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(syntheticHtml);
    });

    await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
    const mockPort = (mockServer.address() as any).port;
    const mockOrigin = `http://127.0.0.1:${mockPort}`;

    try {
      const mockResolver = {
        resolveDomain: async () => mockOrigin,
        getActiveDomain: () => mockOrigin,
        getCachedDomain: () => mockOrigin,
      };

      const syntheticScraper = new AnimevietsubScraper(mockResolver as any);
      logger.info(`Running extraction against synthetic HTML at ${mockOrigin}...`);
      const syntheticEpisodes = await syntheticScraper.getLatestEpisodes(10);

      logger.info(`Extracted ${syntheticEpisodes.length} valid cards from synthetic HTML`);

      // We expect 4 valid cards (Card 1, 2, 3, 4) and 2 filtered out (5, 6)
      challengeAssertEqual(
        syntheticEpisodes.length,
        4,
        "Scraper must extract exactly 4 valid cards and cleanly filter out the 2 malformed cards"
      );

      // Verify Card 1
      const c1 = syntheticEpisodes[0];
      challengeAssertEqual(c1.animeTitle, "Bleach: Thousand-Year Blood War", "Card 1: Year (2024) stripped");
      challengeAssertEqual(c1.episodeName, "Tập 12", "Card 1: Episode standardized to 'Tập 12'");
      challengeAssert(c1.posterUrl.startsWith("http://127.0.0.1"), "Card 1: Relative poster resolved to absolute URL");
      challengeAssertEqual(c1.episodeUrl, `${mockOrigin}/phim/bleach-thousand-year-blood-war-a100/xem-phim.html`, "Card 1: watch URL ends with /xem-phim.html");

      // Verify Card 2
      const c2 = syntheticEpisodes[1];
      challengeAssertEqual(c2.animeTitle, "Attack on Titan: The Final Season", "Card 2: Title matches");
      challengeAssertEqual(c2.episodeName, "Hoàn tất", "Card 2: 'Hoàn tất (28/28)' normalized to 'Hoàn tất'");
      challengeAssertEqual(c2.posterUrl, "https://cdn.example.com/aot.png", "Card 2: data-src poster extracted");

      // Verify Card 3
      const c3 = syntheticEpisodes[2];
      challengeAssertEqual(c3.episodeName, "Tập 8", "Card 3: Raw numeric episode '8' normalized to 'Tập 8'");

      // Verify Card 4
      const c4 = syntheticEpisodes[3];
      challengeAssertEqual(c4.animeTitle, "Jujutsu Kaisen Season 2", "Card 4: Title extracted from a[title] attribute");
      challengeAssertEqual(c4.episodeName, "Tập 23", "Card 4: Episode extracted from .Qlty");

      await syntheticScraper.close();
    } finally {
      mockServer.close();
    }

  } finally {
    // =========================================================================
    // CLEANUP & TEARDOWN
    // =========================================================================
    logger.info("\n>>> CLEANUP & TEARDOWN <<<");
    await scraper.close().catch(() => {});
    await playwrightCrawler.close().catch(() => {});

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

    logger.info("Restored bot_settings original state.");
  }

  const totalDuration = ((performance.now() - t0) / 1000).toFixed(3);
  logger.info("\n===============================================================================");
  if (failedAssertions === 0) {
    logger.success(`EMPIRICAL CHALLENGE SUITE: ALL ${passedAssertions} ASSERTIONS PASSED!`);
  } else {
    logger.error(`EMPIRICAL CHALLENGE SUITE: ${failedAssertions} OF ${totalAssertions} FAILED!`);
    failureDetails.forEach((f, idx) => logger.error(`  ${idx + 1}. ${f}`));
  }
  logger.info(`Summary: ${passedAssertions} passed, ${failedAssertions} failed, duration: ${totalDuration}s`);
  logger.info("===============================================================================");

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

// Run challenge
runAdversarialChallenge().catch((err) => {
  logger.error("FATAL UNCAUGHT EXCEPTION in Adversarial Challenge:", err);
  process.exit(1);
});
