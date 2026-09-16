import { getDatabase } from "../src/database/db";
import { AnimevietsubScraper } from "../src/anime/animevietsubScraper";
import { AnimevietsubDomainResolver } from "../src/anime/domainResolver";
import { SettingsRepository } from "../src/database/repositories/settingsRepo";
import { AnimeEpisodeItem, AnimeSearchResult } from "../src/anime/types";
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

async function runAnimevietsubScraperTests() {
  const startTime = performance.now();
  const RUN_ID = Math.random().toString(36).substring(2, 8);
  logger.info("=======================================================");
  logger.info(`STARTING ANIMEVIETSUB SCRAPER TEST SUITE [Run ID: ${RUN_ID}]`);
  logger.info("=======================================================");

  // Ensure DB initialized
  getDatabase();

  // Backup original settings for clean teardown
  const originalBaseUrl = SettingsRepository.get("animevietsub_base_url");
  const originalVerifiedAt = SettingsRepository.get("animevietsub_verified_at");

  const resolver = new AnimevietsubDomainResolver();
  const scraper = new AnimevietsubScraper(resolver);

  try {
    // =========================================================================
    // PHASE 1: Initialization & Base URL Resolution
    // =========================================================================
    logger.info("\n--- PHASE 1: Initialization & Base URL Resolution ---");

    const baseUrl = await resolver.resolveDomain();
    assert(baseUrl.startsWith("https://"), `Base URL must start with https:// (got ${baseUrl})`);
    logger.info(`Scraper bound to active base URL: ${baseUrl}`);

    // =========================================================================
    // PHASE 2: Latest Anime Releases Scraping (getLatestEpisodes)
    // =========================================================================
    logger.info("\n--- PHASE 2: Latest Anime Releases Scraping ---");

    logger.info("Scraping latest anime releases via Playwright engine...");
    const tLatestStart = performance.now();
    const episodes: AnimeEpisodeItem[] = await scraper.getLatestEpisodes(10);
    const tLatestDuration = performance.now() - tLatestStart;

    logger.info(`Scraped ${episodes.length} latest episodes in ${tLatestDuration.toFixed(2)}ms`);

    // 2.1 Verify count matches Acceptance Criteria (>= 5 items)
    assert(Array.isArray(episodes), "getLatestEpisodes must return an array");
    assert(
      episodes.length >= 5,
      `Acceptance Criteria: Must return at least 5 latest anime episodes (got ${episodes.length})`
    );

    // 2.2 Verify field schemas for EVERY item
    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i];
      const idx = i + 1;

      // animeTitle
      assert(
        typeof ep.animeTitle === "string" && ep.animeTitle.trim().length > 0,
        `Item ${idx}: animeTitle must be a non-empty string (got "${ep.animeTitle}")`
      );

      // episodeName
      assert(
        typeof ep.episodeName === "string" && ep.episodeName.trim().length > 0,
        `Item ${idx}: episodeName must be a non-empty string (got "${ep.episodeName}")`
      );

      // episodeUrl
      assert(
        typeof ep.episodeUrl === "string" && ep.episodeUrl.startsWith("http"),
        `Item ${idx}: episodeUrl must be a valid HTTP/HTTPS URL (got "${ep.episodeUrl}")`
      );
      assert(
        ep.episodeUrl.includes("/phim/"),
        `Item ${idx}: episodeUrl must contain path segment '/phim/' (got "${ep.episodeUrl}")`
      );

      // animeUrl
      assert(
        typeof ep.animeUrl === "string" && ep.animeUrl.startsWith("http"),
        `Item ${idx}: animeUrl must be a valid HTTP/HTTPS URL (got "${ep.animeUrl}")`
      );
      assert(
        ep.animeUrl.includes("/phim/"),
        `Item ${idx}: animeUrl must contain path segment '/phim/' (got "${ep.animeUrl}")`
      );

      // posterUrl
      assert(
        typeof ep.posterUrl === "string" && ep.posterUrl.startsWith("http"),
        `Item ${idx}: posterUrl must be a valid image URL (got "${ep.posterUrl}")`
      );

      // updatedAt (optional)
      if (ep.updatedAt !== undefined) {
        assert(
          typeof ep.updatedAt === "string" && ep.updatedAt.trim().length > 0,
          `Item ${idx}: updatedAt if present must be a non-empty string`
        );
      }
    }

    // Log sample of 3 scraped items for visual confirmation
    logger.info("Sample scraped episodes:");
    episodes.slice(0, 3).forEach((ep, i) => {
      logger.info(`  ${i + 1}. [${ep.episodeName}] ${ep.animeTitle}`);
      logger.info(`     Episode URL: ${ep.episodeUrl}`);
      logger.info(`     Poster URL:  ${ep.posterUrl}`);
    });

    // 2.3 Verify URL uniqueness across scraped batch
    const urls = episodes.map((e) => e.episodeUrl);
    const uniqueUrls = new Set(urls);
    assertEqual(uniqueUrls.size, urls.length, "All scraped episode URLs in the batch must be unique");

    // 2.4 Test limit parameter compliance
    const limit3Episodes = await scraper.getLatestEpisodes(3);
    assert(
      limit3Episodes.length <= 3,
      `Limit = 3 must return at most 3 items (got ${limit3Episodes.length})`
    );

    // =========================================================================
    // PHASE 3: Anime Search Query Scraping (searchAnime)
    // =========================================================================
    logger.info("\n--- PHASE 3: Anime Search Query Scraping ---");

    // 3.1 Positive Search Query: "One Piece"
    logger.info("Executing search query: 'One Piece'...");
    const tSearchStart = performance.now();
    const searchResults: AnimeSearchResult[] = await scraper.searchAnime("One Piece");
    const tSearchDuration = performance.now() - tSearchStart;

    logger.info(`Search 'One Piece' returned ${searchResults.length} results in ${tSearchDuration.toFixed(2)}ms`);
    assert(Array.isArray(searchResults), "searchAnime must return an array");
    assert(searchResults.length > 0, "Search 'One Piece' must return at least 1 result");

    for (const item of searchResults) {
      assert(
        typeof item.title === "string" && item.title.trim().length > 0,
        `Search result title must be non-empty string (got "${item.title}")`
      );
      assert(
        typeof item.animeUrl === "string" && item.animeUrl.startsWith("http") && item.animeUrl.includes("/phim/"),
        `Search result animeUrl must be valid URL containing '/phim/' (got "${item.animeUrl}")`
      );
      assert(
        typeof item.posterUrl === "string" && item.posterUrl.startsWith("http"),
        `Search result posterUrl must be valid image URL (got "${item.posterUrl}")`
      );
    }

    // 3.2 Positive Search Query with Vietnamese text: "Conan"
    logger.info("Executing search query: 'Conan'...");
    const conanResults = await scraper.searchAnime("Conan");
    assert(conanResults.length > 0, "Search 'Conan' must return at least 1 result");
    const hasConan = conanResults.some((r) => r.title.toLowerCase().includes("conan"));
    assert(hasConan, "At least one search result must contain 'conan' in title");

    // 3.3 Negative Search Query: Obscure non-existent anime
    const nonExistentQuery = `xyznoanimequery-${RUN_ID}-999`;
    logger.info(`Executing negative search query: '${nonExistentQuery}'...`);
    const emptyResults = await scraper.searchAnime(nonExistentQuery);
    assert(Array.isArray(emptyResults), "Negative search query must return an array");
    assertEqual(emptyResults.length, 0, "Negative search query must return 0 results (empty array)");

    // =========================================================================
    // PHASE 4: Domain Fallback & Auto-Recovery on Bad Domain
    // =========================================================================
    logger.info("\n--- PHASE 4: Domain Fallback & Auto-Recovery on Bad Domain ---");

    // 4.1 Corrupt cache with an artificial dead domain
    const artificialBadDomain = `https://animevietsub-broken-${RUN_ID}.internal`;
    SettingsRepository.set("animevietsub_base_url", artificialBadDomain);
    logger.info(`Injected artificial bad domain into bot_settings: ${artificialBadDomain}`);

    // Create fresh scraper instance to force read of the corrupted domain
    const fallbackScraper = new AnimevietsubScraper(new AnimevietsubDomainResolver());

    // 4.2 Call getLatestEpisodes: Scraper should fail on bad domain, trigger resolver refresh, and recover
    logger.info("Calling getLatestEpisodes on corrupted domain (verifying auto-fallback)...");
    const tFallbackStart = performance.now();
    const recoveredEpisodes = await fallbackScraper.getLatestEpisodes(5);
    const tFallbackDuration = performance.now() - tFallbackStart;

    assert(
      Array.isArray(recoveredEpisodes) && recoveredEpisodes.length >= 5,
      `Fallback must transparently recover and return >= 5 episodes (got ${recoveredEpisodes.length})`
    );
    logger.info(
      `Transparent domain recovery succeeded in ${tFallbackDuration.toFixed(2)}ms with ${recoveredEpisodes.length} episodes!`
    );

    // 4.3 Verify that bot_settings was updated with the new healthy domain
    const recoveredSetting = SettingsRepository.get("animevietsub_base_url");
    assert(
      recoveredSetting !== artificialBadDomain,
      "bot_settings must NO LONGER be the artificial bad domain"
    );
    assert(
      recoveredSetting !== null && recoveredSetting.startsWith("https://animevietsub."),
      `bot_settings must be updated to the healthy live domain (got "${recoveredSetting}")`
    );
    logger.success(`Database setting updated after fallback: ${recoveredSetting}`);

    // Cleanup fallback scraper
    await fallbackScraper.close();

    // =========================================================================
    // PHASE 5: Resource Management & Lifecycle Cleanup
    // =========================================================================
    logger.info("\n--- PHASE 5: Resource Management & Browser Lifecycle ---");

    // Close primary scraper
    await scraper.close();
    logger.success("Playwright browser closed cleanly without errors.");

  } finally {
    // =========================================================================
    // PHASE 6: Teardown & State Restoration
    // =========================================================================
    logger.info("\n--- CLEANUP & TEARDOWN ---");
    await scraper.close().catch(() => {});

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
    logger.success("ALL ANIMEVIETSUB SCRAPER TESTS PASSED!");
  } else {
    logger.error(`ANIMEVIETSUB SCRAPER TESTS FAILED: ${failedCount} failures!`);
  }
  logger.info(`Total Tests: ${passedCount} passed, ${failedCount} failed`);
  logger.info(`Execution Time: ${totalTime}s`);
  logger.info("=======================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

// Execute test suite
runAnimevietsubScraperTests().catch((err) => {
  logger.error("Animevietsub Scraper Test Suite Failed with unhandled error:", err);
  process.exit(1);
});
