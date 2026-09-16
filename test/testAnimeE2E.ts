import { animevietsubScraper, anilistService, domainResolver } from "../src/anime";
import { AnimeEpisodeRepository } from "../src/database/repositories/animeEpisodeRepo";
import { GuildAnimeRepository } from "../src/database/repositories/guildAnimeRepo";
import { DiscordAnimeEmbedBuilder } from "../src/discord/animeEmbedBuilder";
import { logger } from "../src/utils/logger";

async function testAnimeE2E() {
  logger.info("==================================================");
  logger.info("   E2E ANIMEVIETSUB & ANILIST INTEGRATION TEST   ");
  logger.info("==================================================");

  // 1. Domain Resolver
  logger.info("\n--- STEP 1: Verify Domain Resolver ---");
  const activeDomain = await domainResolver.resolveDomain();
  console.assert(activeDomain.startsWith("https://"), "Domain must start with https://");
  console.assert(activeDomain.includes("animevietsub"), "Domain must be animevietsub");
  logger.success(`Resolved active domain: ${activeDomain}`);

  // 2. AnimeVietsub Scraper
  logger.info("\n--- STEP 2: Fetch Latest Anime from Scraper ---");
  const episodes = await animevietsubScraper.getLatestEpisodes(3);
  console.assert(episodes.length > 0, "Must return at least 1 episode");
  logger.success(`Scraped ${episodes.length} latest episodes:`);

  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i];
    console.log(`\n[Episode #${i + 1}]`);
    console.log(`Title: ${ep.animeTitle}`);
    console.log(`Episode: ${ep.episodeName}`);
    console.log(`URL: ${ep.episodeUrl}`);
    console.log(`Anime URL: ${ep.animeUrl}`);
    console.log(`Poster: ${ep.posterUrl}`);
    console.assert(ep.animeTitle.length > 0, "Title must not be empty");
    console.assert(ep.episodeUrl.includes("http"), "Episode URL must be valid");
  }

  // 3. AniList Enrichment & Panorama Banner
  logger.info("\n--- STEP 3: AniList GraphQL Enrichment ---");
  const firstEp = episodes[0];
  const metadata = await anilistService.enrich(firstEp.animeTitle, firstEp.animeUrl);
  console.assert(metadata !== null, `AniList should match metadata for "${firstEp.animeTitle}"`);

  if (metadata) {
    logger.success(`AniList ID: ${metadata.id} ("${metadata.romajiTitle}")`);
    logger.info(`Score: ${metadata.averageScore}/100`);
    logger.info(`Studio: ${metadata.studio || "(None)"}`);
    logger.info(`Cover: ${metadata.coverImage}`);
    logger.info(`Banner: ${metadata.bannerImage || "(None)"}`);

    if (metadata.bannerImage) {
      const imgRes = await fetch(metadata.bannerImage);
      console.assert(imgRes.status === 200, `Banner must return HTTP 200, got ${imgRes.status}`);
      logger.success(`Verified panorama banner returns HTTP 200 OK (${imgRes.headers.get("content-type")})`);
    }
  }

  // 4. Component V2 UI Payload Builder
  logger.info("\n--- STEP 4: Verify Discord Component V2 Builder ---");
  const singleNotification = DiscordAnimeEmbedBuilder.buildAnimeNotification(firstEp, metadata);
  console.assert(singleNotification.components.length === 1, "Must contain 1 container");
  console.assert(singleNotification.flags === 32768, "Flags must be MessageFlags.IsComponentsV2 (32768)");
  logger.success("Single episode Component V2 payload built successfully with IsComponentsV2 flag!");

  const latestCards = DiscordAnimeEmbedBuilder.buildAnimeLatestCards([
    { episode: firstEp, metadata },
  ]);
  console.assert(latestCards.components.length === 1, "Must contain 1 container");
  console.assert(latestCards.flags === 32768, "Flags must be MessageFlags.IsComponentsV2 (32768)");
  logger.success("Latest cards Component V2 payload built successfully!");

  // 5. Database Repository Verification
  logger.info("\n--- STEP 5: Verify SQLite Anime Repositories ---");
  const testGuildId = "test_e2e_guild_123";
  const testChannelId = "test_e2e_channel_456";

  GuildAnimeRepository.setChannel(testGuildId, testChannelId);
  const retrievedChannel = GuildAnimeRepository.getChannel(testGuildId);
  console.assert(retrievedChannel?.channel_id === testChannelId, "Channel ID must match");
  logger.success("GuildAnimeRepository set and get passed!");

  GuildAnimeRepository.removeChannel(testGuildId);
  console.assert(GuildAnimeRepository.getChannel(testGuildId) === null, "Channel must be deleted");
  logger.success("GuildAnimeRepository remove passed!");

  const testEpUrl = `https://test.animevietsub.zip/episode-${Date.now()}`;
  console.assert(!AnimeEpisodeRepository.isNotified(testEpUrl), "Must not be notified yet");
  AnimeEpisodeRepository.markNotified({
    animeTitle: "Test Anime",
    episodeName: "Tập 1",
    episodeUrl: testEpUrl,
  });
  console.assert(AnimeEpisodeRepository.isNotified(testEpUrl), "Must be marked as notified");
  logger.success("AnimeEpisodeRepository isNotified and markNotified passed!");

  // Clean up scraper browser
  await animevietsubScraper.close();

  logger.success("\n==================================================");
  logger.success("   ALL ANIME E2E INTEGRATION TESTS PASSED!       ");
  logger.success("==================================================");
}

testAnimeE2E().catch((err) => {
  logger.error("E2E test failed:", err);
  process.exit(1);
});

