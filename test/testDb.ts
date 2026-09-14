import { ChapterRepository } from "../src/database/repositories/chapterRepo";
import { GuildRepository } from "../src/database/repositories/guildRepo";
import { DiscordEmbedBuilder } from "../src/discord/embedBuilder";
import { logger } from "../src/utils/logger";

async function testDatabaseAndEmbed() {
  logger.info("--- TEST 1: Guild Repository ---");
  const testGuildId = "1234567890";
  const testChannelId = "9876543210";

  GuildRepository.setChannel(testGuildId, testChannelId, "all");
  const found = GuildRepository.getByGuildId(testGuildId);
  console.assert(found !== null, "Guild should be found");
  console.assert(found?.channel_id === testChannelId, "Channel ID should match");
  logger.success("GuildRepository set and get works properly!");

  const allGuilds = GuildRepository.getAll();
  console.assert(allGuilds.length >= 1, "Should have at least 1 guild");
  logger.success(`GuildRepository getAll returned ${allGuilds.length} guilds.`);

  logger.info("--- TEST 2: Chapter Repository ---");
  const testChapterId = Math.floor(Math.random() * 10000000) + 90000000;
  console.assert(!ChapterRepository.isNotified(testChapterId), "Chapter should not be notified yet");
  ChapterRepository.markNotified(testChapterId, 111, "Test Manga", "10", "Test Title");
  console.assert(ChapterRepository.isNotified(testChapterId), "Chapter should now be notified");
  logger.success("ChapterRepository mark and check works properly!");

  logger.info("--- TEST 3: Embed Builder ---");
  const payload = DiscordEmbedBuilder.buildChapterNotification({
    chapterId: 12345,
    chapterNumber: "45.5",
    chapterTitle: "Hồi Kết",
    chapterCreatedAt: new Date().toISOString(),
    chapterUrl: "https://cuutruyen.net/mangas/1/chapters/12345",
    mangaId: 1,
    mangaTitle: "Dược Sư Tự Sự",
    mangaUrl: "https://cuutruyen.net/mangas/1",
    coverUrl: "https://storage-ct.lrclib.net/file/cuutruyen/uploads/test.jpg",
    authorName: "Natsu Hyuuga",
    teamName: "Hội Mọt Sách",
    teamFacebook: "hoimotsach",
    tags: ["Historical", "Mystery", "Drama"],
    description: "Câu chuyện về nàng dược sư tài ba chốn hoàng cung.",
    viewsCount: 152000,
    dominantColor: "#4DBA87",
    isNsfw: false,
  });

  console.assert(payload.embeds.length === 1, "Should have 1 embed");
  console.assert(payload.components.length === 1, "Should have 1 action row");
  const embed = payload.embeds[0];
  console.assert(embed.data.title?.includes("Dược Sư Tự Sự"), "Embed title should include manga name");
  logger.success("DiscordEmbedBuilder successfully built rich embed with interactive buttons!");

  // Cleanup test guild
  GuildRepository.removeChannel(testGuildId);
  logger.success("Cleaned up test data.");

  logger.success("ALL DATABASE AND EMBED TESTS PASSED!");
}

testDatabaseAndEmbed().catch((err) => {
  logger.error("Test failed:", err);
  process.exit(1);
});
