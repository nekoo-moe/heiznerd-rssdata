import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { config } from "../../config/env";
import { cuutruyenClient } from "../../crawler/cuutruyenClient";
import { ChapterRepository } from "../../database/repositories/chapterRepo";
import { GuildRepository } from "../../database/repositories/guildRepo";
import { DiscordEmbedBuilder } from "../embedBuilder";
import { BotCommand } from "../types";

export const statusCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("📊 Xem thông số hoạt động của hệ thống, crawler và phiên kết nối"),
  execute: async (interaction: ChatInputCommandInteraction) => {
    const clientStatus = cuutruyenClient.getStatus();
    const channelsCount = GuildRepository.count();
    const chaptersCount = ChapterRepository.count();
    const uptime = process.uptime();

    const payload = DiscordEmbedBuilder.buildStatus({
      isLoggedIn: clientStatus.isLoggedIn,
      userId: clientStatus.userId,
      configuredChannelsCount: channelsCount,
      notifiedChaptersCount: chaptersCount,
      pollInterval: config.cuutruyen.pollIntervalSeconds,
      uptimeSeconds: uptime,
      crawlerMode: config.cuutruyen.crawlerMode,
    });

    await interaction.reply(payload as any);
  },
};
