import { Client, TextChannel } from "discord.js";
import { config } from "../config/env";
import { AnimeEpisodeRepository } from "../database/repositories/animeEpisodeRepo";
import { GuildAnimeRepository } from "../database/repositories/guildAnimeRepo";
import { DiscordAnimeEmbedBuilder } from "../discord/animeEmbedBuilder";
import { discordQueue } from "../discord/rateLimiter";
import { logger } from "../utils/logger";
import { anilistService } from "./anilistService";
import { animevietsubScraper } from "./animevietsubScraper";
import { AnimeCrawlerStats, AnimeEpisodeItem } from "./types";

export class AnimeCrawlerManager {
  private discordClient: Client | null = null;
  private timer: NodeJS.Timeout | null = null;
  private isChecking: boolean = false;
  private isInitialized: boolean = false;
  private stats: AnimeCrawlerStats = {
    isRunning: false,
    lastPollAt: null,
    totalPolled: 0,
    totalDispatched: 0,
    lastError: null,
    activeDomain: null,
  };

  public setDiscordClient(client: Client): void {
    this.discordClient = client;
  }

  public getStats(): Readonly<AnimeCrawlerStats> {
    return { ...this.stats };
  }

  public async start(): Promise<void> {
    logger.crawler("Starting AnimeVietsub Crawler Manager...");
    this.stats.isRunning = true;

    // Initial check & seeding
    await this.checkUpdates(true);

    const pollIntervalSeconds = 60; // 60s poll interval for anime updates
    const intervalMs = pollIntervalSeconds * 1000;

    this.timer = setInterval(() => {
      this.checkUpdates(false).catch((err) => {
        logger.error("Error during scheduled anime crawl check:", err);
      });
    }, intervalMs);

    logger.crawler(`Scheduled anime crawl check configured every ${pollIntervalSeconds} seconds.`);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stats.isRunning = false;
    logger.crawler("Anime Crawler Manager stopped.");
  }

  public async checkUpdates(isInitialBoot: boolean = false): Promise<{
    checkedCount: number;
    newEpisodesCount: number;
  }> {
    if (this.isChecking) {
      logger.crawler("Anime check already in progress, skipping overlapping run.");
      return { checkedCount: 0, newEpisodesCount: 0 };
    }

    this.isChecking = true;
    let newEpisodesCount = 0;

    try {
      this.stats.lastPollAt = new Date().toISOString();
      const episodes = await animevietsubScraper.getLatestEpisodes(25);

      if (!episodes || episodes.length === 0) {
        logger.warn("No anime episodes returned from AnimeVietsub.");
        return { checkedCount: 0, newEpisodesCount: 0 };
      }

      this.stats.totalPolled += episodes.length;

      // Initial boot seeding: if DB has 0 recorded episodes, seed them without spamming
      const totalNotifiedInDb = AnimeEpisodeRepository.count();
      if (totalNotifiedInDb === 0) {
        logger.crawler("Database has no prior anime episode records. Seeding initial state...");
        AnimeEpisodeRepository.seedInitial(episodes);
        logger.success(`Seeded ${episodes.length} current anime episodes into database.`);
        this.isInitialized = true;
        return { checkedCount: episodes.length, newEpisodesCount: 0 };
      }

      // Filter for unnotified episodes
      const newItems: AnimeEpisodeItem[] = [];
      for (const ep of episodes) {
        if (!AnimeEpisodeRepository.isNotified(ep.episodeUrl)) {
          newItems.push(ep);
        }
      }

      if (newItems.length === 0) {
        logger.crawler(`Check complete: ${episodes.length} anime scanned, no new episodes.`);
        return { checkedCount: episodes.length, newEpisodesCount: 0 };
      }

      logger.success(`Found ${newItems.length} NEW anime episodes to notify!`);

      // Reverse to alert chronological order (oldest unnotified first)
      const toNotify = [...newItems].reverse();

      for (const ep of toNotify) {
        try {
          logger.crawler(`Enriching AniList metadata for anime "${ep.animeTitle}" (${ep.episodeName})...`);
          const metadata = await anilistService.enrich(ep.animeTitle, ep.animeUrl).catch(() => null);

          const sendSuccess = await this.dispatchEpisodeNotification(ep, metadata);

          if (sendSuccess) {
            AnimeEpisodeRepository.markNotified(ep);
            newEpisodesCount++;
            this.stats.totalDispatched++;
          } else {
            logger.warn(`Dispatch failed for "${ep.animeTitle}" - retaining for next cycle.`);
          }
        } catch (err: any) {
          logger.error(`Failed to process anime episode "${ep.animeTitle}":`, err);
        }
      }

      logger.success(
        `Anime check finished: scanned ${episodes.length}, new episodes alerted: ${newEpisodesCount}`
      );
      return { checkedCount: episodes.length, newEpisodesCount };
    } catch (error: any) {
      this.stats.lastError = error?.message || String(error);
      logger.error("Error during anime checkUpdates:", error);
      return { checkedCount: 0, newEpisodesCount: 0 };
    } finally {
      this.isChecking = false;
    }
  }

  private async dispatchEpisodeNotification(
    episode: AnimeEpisodeItem,
    metadata: any
  ): Promise<boolean> {
    if (!this.discordClient) {
      logger.warn("Discord client not available. Cannot dispatch anime notification.");
      return false;
    }

    const channels = GuildAnimeRepository.getAllChannels();

    if (channels.length === 0) {
      logger.info(
        `No Discord channels configured for anime alerts. Episode "${episode.animeTitle}" marked as seen.`
      );
      return true;
    }

    const payload = DiscordAnimeEmbedBuilder.buildAnimeNotification(episode, metadata);
    let sentCount = 0;

    for (const conf of channels) {
      try {
        const channel = (await this.discordClient.channels.fetch(conf.channel_id).catch((err) => {
          if (err?.code === 10003 || err?.status === 404) {
            logger.warn(
              `Anime channel ${conf.channel_id} does not exist on Discord (Unknown Channel). Auto-removing from database.`
            );
            GuildAnimeRepository.removeChannel(conf.guild_id);
          }
          return null;
        })) as TextChannel | null;

        if (!channel) {
          logger.warn(`Channel ${conf.channel_id} not found or inaccessible for guild ${conf.guild_id}.`);
          continue;
        }

        await discordQueue.enqueue(async () => {
          await channel.send(payload as any);
        });

        logger.info(
          `[DISCORD] Sent anime alert for "${episode.animeTitle}" to channel #${channel.name} (${channel.id})`
        );
        sentCount++;
      } catch (err) {
        logger.error(`Failed to send anime alert to channel ${conf.channel_id}:`, err);
      }
    }

    return sentCount > 0;
  }
}

export const animeCrawlerManager = new AnimeCrawlerManager();
