import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { cuutruyenClient } from "../../crawler/cuutruyenClient";
import { DiscordEmbedBuilder } from "../embedBuilder";
import { BotCommand } from "../types";

export const newestCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("newest")
    .setDescription("Gửi bộ truyện mới nhất vừa cập nhật qua Discord Component V2 kèm ảnh bìa")
    .addBooleanOption((option) =>
      option
        .setName("broadcast")
        .setDescription("Gửi công khai vào kênh cho mọi người xem (mặc định: Có)")
        .setRequired(false)
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    const broadcast = interaction.options.getBoolean("broadcast") ?? true;
    await interaction.deferReply({ ephemeral: !broadcast });

    const mangas = await cuutruyenClient.getRecentlyUpdated(1, 1);
    if (!mangas || mangas.length === 0) {
      await interaction.editReply({
        content: "❌ Không lấy được dữ liệu truyện mới từ Cuutruyen vào lúc này.",
      });
      return;
    }

    const latestManga = mangas[0];
    const enriched = await cuutruyenClient.enrichChapter(latestManga);
    const payload = DiscordEmbedBuilder.buildChapterNotification(enriched);

    await interaction.editReply(payload as any);
  },
};
