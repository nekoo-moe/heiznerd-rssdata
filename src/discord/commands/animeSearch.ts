import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { animevietsubScraper } from "../../anime";
import { DiscordAnimeEmbedBuilder } from "../animeEmbedBuilder";
import { BotCommand } from "../types";

export const animeSearchCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("anime-search")
    .setDescription("🔎 Tìm kiếm phim anime trên AnimeVietsub & xem thông tin chi tiết")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Tên phim anime muốn tìm kiếm")
        .setRequired(true)
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const query = interaction.options.getString("query", true);
    const results = await animevietsubScraper.searchAnime(query, 10);

    const payload = DiscordAnimeEmbedBuilder.buildAnimeSearchResults(query, results);
    await interaction.editReply(payload as any);
  },
};

