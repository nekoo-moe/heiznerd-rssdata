import { Client, TextChannel } from "discord.js";
import { config } from "../config/env";
import { ChapterRepository } from "../database/repositories/chapterRepo";
import { GuildRepository } from "../database/repositories/guildRepo";
import { DiscordEmbedBuilder } from "../discord/embedBuilder";
import { discordQueue } from "../discord/rateLimiter";
import { logger } from "../utils/logger";
import { cuutruyenClient } from "./cuutruyenClient";
import { MangaListItem } from "./types";

export class CrawlerManager {
  private discordClient: Client | null = null;
  private timer: NodeJS.Timeout | null = null;
  private isChecking: boolean = false;
  private isInitialized: boolean = false;

  public setDiscordClient(client: Client): void {
    this.discordClient = client;
  }

  public async start(): Promise<void> {
    logger.crawler("Starting Cuutruyen Crawler Manager...");
    // Attempt initial login
    await cuutruyenClient.login();

    // Initial check and seed
    await this.checkUpdates(true);

    const intervalMs = config.cuutruyen.pollIntervalSeconds * 1000;
    this.timer = setInterval(() => {
      this.checkUpdates(false).catch((err) => {
        logger.error("Error during scheduled crawl check:", err);
      });
    }, intervalMs);

    logger.crawler(
      `Scheduled crawl check configured every ${config.cuutruyen.pollIntervalSeconds} seconds.`
    );
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.crawler("Crawler Manager stopped.");
    }
  }

  public async checkUpdates(isInitialBoot: boolean = false): Promise<{
    checkedCount: number;
    newChaptersCount: number;
  }> {
    if (this.isChecking) {
      logger.crawler("Crawler check already in progress, skipping overlapping run.");
      return { checkedCount: 0, newChaptersCount: 0 };
    }

    this.isChecking = true;
    let newChaptersCount = 0;

    try {
      logger.crawler("Fetching recently updated mangas from Cuutruyen (home_a + recently_updated)...");
      const mangas = await cuutruyenClient.getLatestUpdates();

      if (!mangas || mangas.length === 0) {
        logger.warn("No mangas returned from Cuutruyen.");
        return { checkedCount: 0, newChaptersCount: 0 };
      }

      // If DB has 0 chapters recorded, this is initial boot.
      // Seed existing chapters so bot does not flood the server with 25 notifications on first startup.
      const totalNotifiedInDb = ChapterRepository.count();
      if (totalNotifiedInDb === 0) {
        logger.crawler("Database has no prior chapter records. Seeding initial state...");
        for (const m of mangas) {
          if (m.newest_chapter_id) {
            ChapterRepository.markNotified(
              m.newest_chapter_id,
              m.id,
              m.name,
              m.newest_chapter_number,
              ""
            );
          }
        }
        logger.success(`Seeded ${mangas.length} current chapters into database.`);
        this.isInitialized = true;
        return { checkedCount: mangas.length, newChaptersCount: 0 };
      }

      // Identify newly released chapters
      const newItems: MangaListItem[] = [];
      for (const m of mangas) {
        if (m.newest_chapter_id && !ChapterRepository.isNotified(m.newest_chapter_id)) {
          newItems.push(m);
        }
      }

      if (newItems.length === 0) {
        logger.crawler(`Check complete: ${mangas.length} mangas scanned, no new chapters.`);
        return { checkedCount: mangas.length, newChaptersCount: 0 };
      }

      logger.success(`Found ${newItems.length} NEW chapters to notify!`);
      newChaptersCount = newItems.length;

      // Process oldest to newest so notifications appear in chronological order
      newItems.reverse();

      for (const item of newItems) {
        await this.processNewChapter(item);
      }

      return { checkedCount: mangas.length, newChaptersCount };
    } catch (error) {
      logger.error("Error in checkUpdates:", error);
      return { checkedCount: 0, newChaptersCount: 0 };
    } finally {
      this.isChecking = false;
    }
  }

  private async processNewChapter(mangaItem: MangaListItem): Promise<void> {
    try {
      logger.crawler(
        `Enriching metadata for manga "${mangaItem.name}" (Chapter ${mangaItem.newest_chapter_number})...`
      );
      const enriched = await cuutruyenClient.enrichChapter(mangaItem);

      // If discord client is not ready or has no channels, skip for now
      if (!this.discordClient || !this.discordClient.isReady()) {
        logger.warn("Discord client not ready yet, skipping chapter send.");
        return;
      }

      const guildChannels = GuildRepository.getAll();
      if (guildChannels.length === 0) {
        logger.crawler("No Discord notification channels configured yet (use /setchannel).");
        return;
      }

      const messagePayload = DiscordEmbedBuilder.buildChapterNotification(enriched);

      let sendSuccess = false;
      for (const setting of guildChannels) {
        // Enqueue sending via the rate-limited queue
        await discordQueue.enqueue(async () => {
          try {
            const channel = await this.discordClient?.channels.fetch(setting.channel_id);
            if (channel && channel.isTextBased()) {
              await (channel as TextChannel).send(messagePayload as any);
              sendSuccess = true;
              logger.discord(
                `Sent chapter alert for "${enriched.mangaTitle}" to channel #${(channel as TextChannel).name} (${setting.channel_id})`
              );
            } else {
              logger.warn(`Configured channel ${setting.channel_id} is not accessible.`);
            }
          } catch (err) {
            logger.error(`Failed to send alert to channel ${setting.channel_id}:`, err);
          }
        });
      }

      // Only mark notified when successfully dispatched to at least one channel
      if (sendSuccess) {
        ChapterRepository.markNotified(
          enriched.chapterId,
          enriched.mangaId,
          enriched.mangaTitle,
          enriched.chapterNumber,
          enriched.chapterTitle
        );
      }
    } catch (error) {
      logger.error(`Failed processing chapter ${mangaItem.newest_chapter_id}:`, error);
    }
  }
}

export const crawlerManager = new CrawlerManager();

