import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { DiscordLnEmbedBuilder } from "../lnEmbedBuilder";
import { hakoScraper } from "../../ln";
import { BotCommand } from "../types";

export const lnSearchCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ln-search")
    .setDescription("🔎 Tìm kiếm Light Novel trên Cổng Hako & xem thông tin chi tiết")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Tên bộ Light Novel muốn tìm kiếm")
        .setRequired(true)
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const query = interaction.options.getString("query", true);
    const results = await hakoScraper.searchNovel(query, 10);

    const payload = DiscordLnEmbedBuilder.buildLnSearchResults(query, results);
    await interaction.editReply(payload as any);
  },
};

