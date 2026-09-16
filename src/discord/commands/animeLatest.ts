import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { animevietsubScraper, anilistService } from "../../anime";
import { DiscordAnimeEmbedBuilder } from "../animeEmbedBuilder";
import { BotCommand } from "../types";

export const animeLatestCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("anime-latest")
    .setDescription("Xem các tập anime mới cập nhật từ AnimeVietsub kèm banner AniList")
    .addIntegerOption((option) =>
      option
        .setName("count")
        .setDescription("Số lượng anime muốn hiển thị (1 - 5)")
        .setMinValue(1)
        .setMaxValue(5)
        .setRequired(false)
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const count = interaction.options.getInteger("count") || 3;
    const episodes = await animevietsubScraper.getLatestEpisodes(count);

    if (!episodes || episodes.length === 0) {
      await interaction.editReply({
        content: "❌ Không lấy được dữ liệu anime từ AnimeVietsub vào lúc này.",
      });
      return;
    }

    const items = await Promise.all(
      episodes.slice(0, count).map(async (ep) => {
        const metadata = await anilistService.enrich(ep.animeTitle, ep.animeUrl).catch(() => null);
        return { episode: ep, metadata };
      })
    );

    const payload = DiscordAnimeEmbedBuilder.buildAnimeLatestCards(items);
    await interaction.editReply(payload as any);
  },
};

