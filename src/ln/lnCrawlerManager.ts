/**
 * src/ln/lnCrawlerManager.ts
 * Background Crawler Manager for Cổng Light Novel (Hako / Docln).
 */

import { Client, TextChannel } from "discord.js";
import { GuildLnRepository } from "../database/repositories/guildLnRepo";
import { LnChapterRepository } from "../database/repositories/lnChapterRepo";
import { DiscordLnEmbedBuilder } from "../discord/lnEmbedBuilder";
import { discordQueue } from "../discord/rateLimiter";
import { logger } from "../utils/logger";
import { hakoScraper } from "./hakoScraper";
import { LnChapterItem, LnCrawlerStats } from "./types";

export class LnCrawlerManager {
  private discordClient: Client | null = null;
  private timer: NodeJS.Timeout | null = null;
  private isChecking: boolean = false;
  private isInitialized: boolean = false;
  private stats: LnCrawlerStats = {
    isRunning: false,
    lastPollAt: null,
    totalPolled: 0,
    totalDispatched: 0,
    lastError: null,
  };

  public setDiscordClient(client: Client): void {
    this.discordClient = client;
  }

  public getStats(): Readonly<LnCrawlerStats> {
    return { ...this.stats };
  }

  public async start(): Promise<void> {
    logger.crawler("Starting Hako Light Novel Crawler Manager...");
    this.stats.isRunning = true;

    // Initial check & seeding
    await this.checkUpdates(true);

    const pollIntervalSeconds = 120; // 120s poll interval for Light Novels
    const intervalMs = pollIntervalSeconds * 1000;

    this.timer = setInterval(() => {
      this.checkUpdates(false).catch((err) => {
        logger.error("Error during scheduled Light Novel crawl check:", err);
      });
    }, intervalMs);

    logger.crawler(`Scheduled Light Novel crawl check configured every ${pollIntervalSeconds} seconds.`);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stats.isRunning = false;
    logger.crawler("Hako Light Novel Crawler Manager stopped.");
  }

  public async checkUpdates(isInitialBoot: boolean = false): Promise<{
    checkedCount: number;
    newChaptersCount: number;
  }> {
    if (this.isChecking) {
      logger.crawler("Light Novel check already in progress, skipping overlapping run.");
      return { checkedCount: 0, newChaptersCount: 0 };
    }

    this.isChecking = true;
    let newChaptersCount = 0;

    try {
      this.stats.lastPollAt = new Date().toISOString();
      const chapters = await hakoScraper.getLatestChapters(20);

      if (!chapters || chapters.length === 0) {
        return { checkedCount: 0, newChaptersCount: 0 };
      }

      this.stats.totalPolled += chapters.length;

      // Initial boot seeding: if DB has 0 recorded LN chapters, seed them without spamming
      const totalNotifiedInDb = LnChapterRepository.count();
      if (totalNotifiedInDb === 0) {
        logger.crawler("Database has no prior Light Novel chapter records. Seeding initial state...");
        LnChapterRepository.seedInitial(chapters);
        logger.success(`Seeded ${chapters.length} current Light Novel chapters into database.`);
        this.isInitialized = true;
        return { checkedCount: chapters.length, newChaptersCount: 0 };
      }

      // Filter unnotified chapters
      const newItems: LnChapterItem[] = [];
      for (const ch of chapters) {
        if (!LnChapterRepository.isNotified(ch.chapterUrl)) {
          newItems.push(ch);
        }
      }

      if (newItems.length === 0) {
        logger.info(`[Hako] Check complete: ${chapters.length} Light Novels scanned, no new chapters.`);
        return { checkedCount: chapters.length, newChaptersCount: 0 };
      }

      // Process oldest to newest
      const queue = [...newItems].reverse();
      logger.info(`[Hako] Found ${queue.length} new Light Novel chapter(s) to notify!`);

      for (const item of queue) {
        // Fetch series detail for richer metadata if possible
        const detail = await hakoScraper.getNovelDetails(item.seriesUrl).catch(() => null);
        if (detail?.title) {
          item.seriesTitle = detail.title;
        }

        const dispatched = await this.dispatchNotification(item, detail);
        if (dispatched) {
          LnChapterRepository.markNotified(item);
          newChaptersCount++;
          this.stats.totalDispatched++;
        }
      }

      return { checkedCount: chapters.length, newChaptersCount };
    } catch (err: any) {
      logger.error("[Hako] Error during Light Novel checkUpdates:", err);
      this.stats.lastError = err?.message || String(err);
      return { checkedCount: 0, newChaptersCount: 0 };
    } finally {
      this.isChecking = false;
    }
  }

  private async dispatchNotification(
    item: LnChapterItem,
    detail?: any
  ): Promise<boolean> {
    const channelConfigs = GuildLnRepository.getAllChannels();
    if (channelConfigs.length === 0) {
      logger.info(
        `[Hako] New chapter "${item.chapterTitle}" (${item.seriesTitle}), but no guilds configured for Light Novel notifications.`
      );
      return true; // Mark as notified so we don't spam when a channel is later configured
    }

    if (!this.discordClient) {
      logger.warn("[Hako] Discord client not attached to LnCrawlerManager.");
      return false;
    }

    const payload = DiscordLnEmbedBuilder.buildLnNotification(item, detail);
    let sentCount = 0;

    for (const conf of channelConfigs) {
      try {
        const channel = (await this.discordClient.channels.fetch(conf.channel_id).catch((err) => {
          if (err?.code === 10003 || err?.status === 404) {
            logger.warn(
              `Light Novel channel ${conf.channel_id} does not exist on Discord (Unknown Channel). Auto-removing from database.`
            );
            GuildLnRepository.removeChannel(conf.guild_id);
          }
          return null;
        })) as TextChannel | null;

        if (!channel || !channel.isTextBased()) {
          logger.warn(`[Hako] Channel ${conf.channel_id} not found or not text-based.`);
          continue;
        }

        await discordQueue.enqueue(async () => {
          await channel.send(payload as any);
        });

        logger.discord(
          `[DISCORD] Sent Light Novel alert for "${item.seriesTitle}" to channel #${channel.name} (${channel.id})`
        );
        sentCount++;
      } catch (err) {
        logger.error(`Failed to send Light Novel alert to channel ${conf.channel_id}:`, err);
      }
    }

    return sentCount > 0 || channelConfigs.length === 0;
  }
}

export const lnCrawlerManager = new LnCrawlerManager();
