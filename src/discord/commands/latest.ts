import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { cuutruyenClient } from "../../crawler/cuutruyenClient";
import { DiscordEmbedBuilder } from "../embedBuilder";
import { BotCommand } from "../types";

export const latestCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("latest")
    .setDescription("Xem các truyện mới cập nhật với Discord Component V2 và ảnh bìa")
    .addIntegerOption((option) =>
      option
        .setName("count")
        .setDescription("Số lượng truyện muốn hiển thị (1 - 5)")
        .setMinValue(1)
        .setMaxValue(5)
        .setRequired(false)
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const count = interaction.options.getInteger("count") || 3;
    const mangas = await cuutruyenClient.getRecentlyUpdated(1, count);

    if (!mangas || mangas.length === 0) {
      await interaction.editReply({
        content: "❌ Không lấy được dữ liệu truyện từ Cuutruyen vào lúc này.",
      });
      return;
    }

    const targetMangas = mangas.slice(0, count);
    const enrichedList = await Promise.all(
      targetMangas.map((m) => cuutruyenClient.enrichChapter(m))
    );

    const payload = DiscordEmbedBuilder.buildEnrichedLatestCards(enrichedList);
    await interaction.editReply(payload as any);
  },
};
