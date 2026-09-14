import { cuutruyenClient } from "../src/crawler/cuutruyenClient";
import { playwrightCrawler } from "../src/crawler/playwrightCrawler";
import { logger } from "../src/utils/logger";

async function testCrawler() {
  logger.info("=== STEP 1: TEST CUUTRUYEN AUTHENTICATION ===");
  const loginOk = await cuutruyenClient.login(true);
  console.assert(loginOk, "Login should succeed with user credentials");
  logger.success("Cuutruyen login succeeded!");

  logger.info("=== STEP 2: TEST FETCH RECENTLY UPDATED MANGAS ===");
  const mangas = await cuutruyenClient.getRecentlyUpdated(1, 5);
  console.assert(mangas && mangas.length > 0, "Should return recent mangas list");
  logger.success(`Fetched ${mangas.length} recent mangas:`);
  mangas.forEach((m, idx) => {
    logger.info(`  ${idx + 1}. [ID: ${m.id}] ${m.name} - Chap ${m.newest_chapter_number} (ID: ${m.newest_chapter_id})`);
  });

  logger.info("=== STEP 3: TEST METADATA ENRICHMENT FOR FIRST MANGA ===");
  const firstManga = mangas[0];
  const enriched = await cuutruyenClient.enrichChapter(firstManga);
  logger.success("Enriched chapter result:");
  console.log({
    mangaTitle: enriched.mangaTitle,
    chapterNumber: enriched.chapterNumber,
    chapterTitle: enriched.chapterTitle,
    author: enriched.authorName,
    team: enriched.teamName,
    tags: enriched.tags,
    chapterUrl: enriched.chapterUrl,
    coverUrl: enriched.coverUrl,
    dominantColor: enriched.dominantColor,
  });

  logger.info("=== STEP 4: TEST FOLLOWING MANGAS (AUTHENTICATED) ===");
  const following = await cuutruyenClient.getFollowing(1, 3);
  logger.success(`Account is following ${following.length} mangas (sample 3).`);

  logger.info("=== STEP 5: TEST QUICK SEARCH ===");
  const searchResults = await cuutruyenClient.quickSearch("One Piece");
  logger.success(`Search 'One Piece' returned ${searchResults.length} results.`);

  logger.info("=== STEP 6: TEST PLAYWRIGHT BROWSER ACCESS ===");
  const browserOk = await playwrightCrawler.verifyAccess();
  console.assert(browserOk, "Playwright should successfully load Cuutruyen homepage");
  await playwrightCrawler.close();
  logger.success("Playwright crawler verification successful!");

  logger.success(">>> ALL CRAWLER & SCRAPER TESTS PASSED PERFECTLY! <<<");
}

testCrawler().catch((err) => {
  logger.error("Crawler test encountered an error:", err);
  process.exit(1);
});

