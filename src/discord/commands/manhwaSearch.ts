import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { DiscordManhwaEmbedBuilder } from "../manhwaEmbedBuilder";
import { truyenqqScraper } from "../../manhwa";
import { BotCommand } from "../types";

export const manhwaSearchCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("manhwa-search")
    .setDescription("🔎 Tìm kiếm Manhwa Hàn Quốc trên TruyenQQ & xem thông tin chi tiết")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Tên bộ Manhwa muốn tìm kiếm")
        .setRequired(true)
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const query = interaction.options.getString("query", true);
    const results = await truyenqqScraper.searchManhwa(query, 10);

    const payload = DiscordManhwaEmbedBuilder.buildManhwaSearchResults(query, results);
    await interaction.editReply(payload as any);
  },
};

