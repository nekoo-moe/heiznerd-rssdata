import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { animevietsubScraper, anilistService } from "../../anime";
import { DiscordAnimeEmbedBuilder } from "../animeEmbedBuilder";
import { BotCommand } from "../types";

export const animeNewestCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("anime-newest")
    .setDescription("Xem tập anime mới nhất vừa cập nhật trên AnimeVietsub"),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const episodes = await animevietsubScraper.getLatestEpisodes(1);

    if (!episodes || episodes.length === 0) {
      await interaction.editReply({
        content: "❌ Không lấy được dữ liệu anime từ AnimeVietsub vào lúc này.",
      });
      return;
    }

    const episode = episodes[0];
    const metadata = await anilistService.enrich(episode.animeTitle, episode.animeUrl).catch(() => null);

    const payload = DiscordAnimeEmbedBuilder.buildAnimeNotification(episode, metadata);
    await interaction.editReply(payload as any);
  },
};

