import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { cuutruyenClient } from "../../crawler/cuutruyenClient";
import { DiscordEmbedBuilder } from "../embedBuilder";
import { BotCommand } from "../types";

export const mangaSearchCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("manga-search")
    .setDescription("🔎 Tìm kiếm truyện tranh trên Cuutruyen & xem thông tin chi tiết")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Tên bộ truyện tranh cần tìm kiếm")
        .setRequired(true)
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const query = interaction.options.getString("query", true);
    const results = await cuutruyenClient.quickSearch(query);

    const payload = DiscordEmbedBuilder.buildSearchResults(query, results);
    await interaction.editReply(payload as any);
  },
};
