import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { config } from "../../config/env";
import { cuutruyenClient } from "../../crawler/cuutruyenClient";
import { animevietsubDomainResolver } from "../../anime/domainResolver";
import { truyenqqDomainResolver } from "../../manhwa/domainResolver";
import { AnimeEpisodeRepository } from "../../database/repositories/animeEpisodeRepo";
import { ChapterRepository } from "../../database/repositories/chapterRepo";
import { GuildAnimeRepository } from "../../database/repositories/guildAnimeRepo";
import { GuildLnRepository } from "../../database/repositories/guildLnRepo";
import { GuildManhwaRepository } from "../../database/repositories/guildManhwaRepo";
import { GuildRepository } from "../../database/repositories/guildRepo";
import { LnChapterRepository } from "../../database/repositories/lnChapterRepo";
import { ManhwaChapterRepository } from "../../database/repositories/manhwaChapterRepo";
import { DiscordEmbedBuilder } from "../embedBuilder";
import { BotCommand } from "../types";

export const statusCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("📊 Xem thông số hoạt động của hệ thống, crawler và phiên kết nối"),
  execute: async (interaction: ChatInputCommandInteraction) => {
    const clientStatus = cuutruyenClient.getStatus();
    const uptime = process.uptime();

    const payload = DiscordEmbedBuilder.buildStatus({
      isLoggedIn: clientStatus.isLoggedIn,
      userId: clientStatus.userId,
      mangaChannelsCount: GuildRepository.count(),
      mangaChaptersCount: ChapterRepository.count(),
      animeChannelsCount: GuildAnimeRepository.count(),
      animeEpisodesCount: AnimeEpisodeRepository.count(),
      lnChannelsCount: GuildLnRepository.count(),
      lnChaptersCount: LnChapterRepository.count(),
      manhwaChannelsCount: GuildManhwaRepository.count(),
      manhwaChaptersCount: ManhwaChapterRepository.count(),
      pollInterval: config.cuutruyen.pollIntervalSeconds,
      uptimeSeconds: uptime,
      crawlerMode: config.cuutruyen.crawlerMode,
      animeDomain: animevietsubDomainResolver.getActiveDomain(),
      manhwaDomain: truyenqqDomainResolver.getActiveDomain(),
    });

    await interaction.reply(payload as any);
  },
};
