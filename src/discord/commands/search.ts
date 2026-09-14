import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { cuutruyenClient } from "../../crawler/cuutruyenClient";
import { DiscordEmbedBuilder } from "../embedBuilder";
import { BotCommand } from "../types";

export const searchCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("Tìm kiếm truyện tranh trên Cuutruyen.net")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Tên truyện cần tìm")
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
