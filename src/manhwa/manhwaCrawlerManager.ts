/**
 * src/manhwa/manhwaCrawlerManager.ts
 * Background Crawler Manager for Manhwa (TruyenQQ).
 */

import { Client, TextChannel } from "discord.js";
import { GuildManhwaRepository } from "../database/repositories/guildManhwaRepo";
import { ManhwaChapterRepository } from "../database/repositories/manhwaChapterRepo";
import { DiscordManhwaEmbedBuilder } from "../discord/manhwaEmbedBuilder";
import { discordQueue } from "../discord/rateLimiter";
import { logger } from "../utils/logger";
import { truyenqqDomainResolver } from "./domainResolver";
import { truyenqqScraper } from "./truyenqqScraper";
import { ManhwaChapterItem, ManhwaCrawlerStats } from "./types";

export class ManhwaCrawlerManager {
  private discordClient: Client | null = null;
  private timer: NodeJS.Timeout | null = null;
  private isChecking: boolean = false;
  private isInitialized: boolean = false;
  private stats: ManhwaCrawlerStats = {
    isRunning: false,
    lastPollAt: null,
    totalPolled: 0,
    totalDispatched: 0,
    lastError: null,
    activeDomain: truyenqqDomainResolver.getActiveDomain(),
  };

  public setDiscordClient(client: Client): void {
    this.discordClient = client;
  }

  public getStats(): Readonly<ManhwaCrawlerStats> {
    return {
      ...this.stats,
      activeDomain: truyenqqDomainResolver.getActiveDomain(),
    };
  }

  public async start(): Promise<void> {
    logger.crawler("Starting TruyenQQ Manhwa Crawler Manager...");
    this.stats.isRunning = true;

    // Initial check & seeding
    await this.checkUpdates(true);

    const pollIntervalSeconds = 90; // 90s poll interval for Manhwa
    const intervalMs = pollIntervalSeconds * 1000;

    this.timer = setInterval(() => {
      this.checkUpdates(false).catch((err) => {
        logger.error("Error during scheduled Manhwa crawl check:", err);
      });
    }, intervalMs);

    logger.crawler(`Scheduled Manhwa crawl check configured every ${pollIntervalSeconds} seconds.`);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stats.isRunning = false;
    logger.crawler("TruyenQQ Manhwa Crawler Manager stopped.");
  }

  public async checkUpdates(isInitialBoot: boolean = false): Promise<{
    checkedCount: number;
    newChaptersCount: number;
  }> {
    if (this.isChecking) {
      logger.crawler("Manhwa check already in progress, skipping overlapping run.");
      return { checkedCount: 0, newChaptersCount: 0 };
    }

    this.isChecking = true;
    let newChaptersCount = 0;

    try {
      this.stats.lastPollAt = new Date().toISOString();
      const chapters = await truyenqqScraper.getLatestManhwa(20);

      if (!chapters || chapters.length === 0) {
        return { checkedCount: 0, newChaptersCount: 0 };
      }

      this.stats.totalPolled += chapters.length;

      // Initial boot seeding: if DB has 0 recorded Manhwa chapters, seed them without spamming
      const totalNotifiedInDb = ManhwaChapterRepository.count();
      if (totalNotifiedInDb === 0) {
        logger.crawler("Database has no prior Manhwa chapter records. Seeding initial state...");
        ManhwaChapterRepository.seedInitial(chapters);
        logger.success(`Seeded ${chapters.length} current Manhwa chapters into database.`);
        this.isInitialized = true;
        return { checkedCount: chapters.length, newChaptersCount: 0 };
      }

      // Filter unnotified chapters
      const newItems: ManhwaChapterItem[] = [];
      for (const ch of chapters) {
        if (!ManhwaChapterRepository.isNotified(ch.chapterUrl)) {
          newItems.push(ch);
        }
      }

      if (newItems.length === 0) {
        logger.info(`[TruyenQQ] Check complete: ${chapters.length} Manhwa scanned, no new chapters.`);
        return { checkedCount: chapters.length, newChaptersCount: 0 };
      }

      // Process oldest to newest
      const queue = [...newItems].reverse();
      logger.info(`[TruyenQQ] Found ${queue.length} new Manhwa chapter(s) to notify!`);

      for (const item of queue) {
        // Fetch detail for richer metadata if possible
        const detail = await truyenqqScraper.getManhwaDetails(item.manhwaUrl).catch(() => null);

        const dispatched = await this.dispatchNotification(item, detail);
        if (dispatched) {
          ManhwaChapterRepository.markNotified(item);
          newChaptersCount++;
          this.stats.totalDispatched++;
        }
      }

      return { checkedCount: chapters.length, newChaptersCount };
    } catch (err: any) {
      logger.error("[TruyenQQ] Error during Manhwa checkUpdates:", err);
      this.stats.lastError = err?.message || String(err);
      return { checkedCount: 0, newChaptersCount: 0 };
    } finally {
      this.isChecking = false;
    }
  }

  private async dispatchNotification(
    item: ManhwaChapterItem,
    detail?: any
  ): Promise<boolean> {
    const channelConfigs = GuildManhwaRepository.getAllChannels();
    if (channelConfigs.length === 0) {
      logger.info(
        `[TruyenQQ] New chapter "${item.chapterTitle}" (${item.manhwaTitle}), but no guilds configured for Manhwa notifications.`
      );
      return true; // Mark as notified so we don't spam later
    }

    if (!this.discordClient) {
      logger.warn("[TruyenQQ] Discord client not attached to ManhwaCrawlerManager.");
      return false;
    }

    const payload = DiscordManhwaEmbedBuilder.buildManhwaNotification(item, detail);
    let sentCount = 0;

    for (const conf of channelConfigs) {
      try {
        const channel = (await this.discordClient.channels.fetch(conf.channel_id).catch((err) => {
          if (err?.code === 10003 || err?.status === 404) {
            logger.warn(
              `Manhwa channel ${conf.channel_id} does not exist on Discord (Unknown Channel). Auto-removing from database.`
            );
            GuildManhwaRepository.removeChannel(conf.guild_id);
          }
          return null;
        })) as TextChannel | null;

        if (!channel || !channel.isTextBased()) {
          logger.warn(`[TruyenQQ] Channel ${conf.channel_id} not found or not text-based.`);
          continue;
        }

        await discordQueue.enqueue(async () => {
          await channel.send(payload as any);
        });

        logger.discord(
          `[DISCORD] Sent Manhwa alert for "${item.manhwaTitle}" to channel #${channel.name} (${channel.id})`
        );
        sentCount++;
      } catch (err) {
        logger.error(`Failed to send Manhwa alert to channel ${conf.channel_id}:`, err);
      }
    }

    return sentCount > 0 || channelConfigs.length === 0;
  }
}

export const manhwaCrawlerManager = new ManhwaCrawlerManager();
