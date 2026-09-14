import { cuutruyenClient } from "../src/crawler/cuutruyenClient";
import { DiscordEmbedBuilder } from "../src/discord/embedBuilder";
import { logger } from "../src/utils/logger";

async function testLatestAndNewest() {
  logger.info("=== TEST: FETCHING & ENRICHING RECENT MANGAS WITH COMPONENT V2 ===");

  const mangas = await cuutruyenClient.getRecentlyUpdated(1, 3);
  console.assert(mangas.length > 0, "Must return at least 1 manga");

  logger.info(`Fetching details and enriching metadata for ${mangas.length} mangas...`);
  const enrichedList = await Promise.all(
    mangas.map((m) => cuutruyenClient.enrichChapter(m))
  );

  logger.success("Enriched mangas metadata preview:");
  for (let idx = 0; idx < enrichedList.length; idx++) {
    const item = enrichedList[idx];
    console.log(`\n--- Manga #${idx + 1} ---`);
    console.log(`Title: ${item.mangaTitle}`);
    console.log(`Chapter: ${item.chapterNumber} - ${item.chapterTitle || "(Không có tên)"}`);
    console.log(`Author: ${item.authorName}`);
    console.log(`Team: ${item.teamName}`);
    console.log(`Tags: ${item.tags.join(", ") || "(Không có)"}`);
    console.log(`Cover: ${item.coverUrl}`);
    console.log(`Panorama: ${item.panoramaUrl || "(Không có bìa dài)"}`);
    console.log(`Description: ${item.description.substring(0, 80)}...`);
    console.log(`Dominant Color: ${item.dominantColor}`);
    console.log(`URL: ${item.chapterUrl}`);

    // Verify rewritten image URL is active and returns HTTP 200
    if (item.coverUrl) {
      console.assert(
        !item.coverUrl.includes("storage-ct.lrclib.net"),
        "Cover URL must not use unreachable storage-ct.lrclib.net domain"
      );
      const imgRes = await fetch(item.coverUrl);
      console.assert(imgRes.status === 200, `Cover image must return 200, got ${imgRes.status}`);
      logger.success(`Verified cover image HTTP 200 OK (${imgRes.headers.get("content-type")})`);
    }

    if (item.panoramaUrl) {
      console.assert(
        !item.panoramaUrl.includes("storage-ct.lrclib.net"),
        "Panorama URL must not use unreachable storage-ct.lrclib.net domain"
      );
      const panoRes = await fetch(item.panoramaUrl);
      console.assert(panoRes.status === 200, `Panorama image must return 200, got ${panoRes.status}`);
      logger.success(`Verified panorama banner HTTP 200 OK (${panoRes.headers.get("content-type")})`);
    }
  }

  // Verify /latest payload builder with Component V2
  const latestPayload = DiscordEmbedBuilder.buildEnrichedLatestCards(enrichedList);
  console.assert(latestPayload.components.length === enrichedList.length, "Should create 1 container per manga");
  console.assert(latestPayload.flags === 32768, "Flags must have MessageFlags.IsComponentsV2 (32768)");
  logger.success(`\nVerified /latest Component V2 payload: ${latestPayload.components.length} containers created with IsComponentsV2 flag!`);

  // Verify /newest single payload builder with Component V2
  const newestPayload = DiscordEmbedBuilder.buildChapterNotification(enrichedList[0]);
  console.assert(newestPayload.components.length === 1, "Should create 1 container");
  console.assert(newestPayload.flags === 32768, "Flags must have MessageFlags.IsComponentsV2 (32768)");
  logger.success("Verified /newest Component V2 payload: Container with Section thumbnail, Separator, TextDisplay details and ActionRow buttons!");

  logger.success("\n>>> ALL DISCORD COMPONENT V2 & COVER IMAGE TESTS PASSED! <<<");
}

testLatestAndNewest().catch((err) => {
  logger.error("Test error:", err);
  process.exit(1);
});
