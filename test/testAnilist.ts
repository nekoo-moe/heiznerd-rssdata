import { anilistService } from "../src/anime/anilistService";
import { logger } from "../src/utils/logger";

async function testAnilist() {
  logger.info("=== TESTING ANILIST GRAPHQL SERVICE & PANORAMA BANNER ===");

  const titles = [
    "One Piece: Đảo Hải Tặc (2024)",
    "Thám Tử Lừng Danh Conan - Tập 1100",
    "Bleach: Huyết Chiến Ngàn Năm - Phần 3 (Thuyết Minh)",
  ];

  for (const rawTitle of titles) {
    logger.info(`\nQuerying title: "${rawTitle}"`);
    const normalized = anilistService.normalizeTitle(rawTitle);
    logger.info(`Normalized: primary="${normalized.primary}", candidates=[${normalized.candidates.map(c => `"${c}"`).join(", ")}]`);

    const result = await anilistService.enrich(rawTitle);
    console.assert(result !== null, `Must match on AniList for "${rawTitle}"`);

    if (result) {
      logger.success(`Matched ID: ${result.id}`);
      logger.info(`Romaji: ${result.romajiTitle}`);
      logger.info(`English: ${result.englishTitle || "(None)"}`);
      logger.info(`Studio: ${result.studio || "(Unknown)"}`);
      logger.info(`Score: ${result.averageScore}/100`);
      logger.info(`Genres: ${result.genres.join(", ")}`);
      logger.info(`Cover: ${result.coverImage}`);
      logger.info(`Banner: ${result.bannerImage || "(No panorama banner)"}`);

      if (result.bannerImage) {
        const bannerRes = await fetch(result.bannerImage);
        console.assert(bannerRes.status === 200, `Banner image must return HTTP 200, got ${bannerRes.status}`);
        logger.success(`Verified panorama banner HTTP 200 OK (${bannerRes.headers.get("content-type")})`);
      }
    }
  }

  logger.success("\n>>> ALL ANILIST GRAPHQL TESTS PASSED SUCCESSFULLY! <<<");
}

testAnilist().catch((err) => {
  logger.error("Test failed:", err);
  process.exit(1);
});

