import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { animevietsubScraper, anilistService, isChineseAnimation, AnimeDetailData, AniListMetadata } from "../../anime";
import { DiscordAnimeEmbedBuilder } from "../animeEmbedBuilder";
import { BotCommand } from "../types";

export const animeNewestCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("anime-newest")
    .setDescription("⚡ Xem ngay tập anime mới nhất vừa lên sóng trên AnimeVietsub"),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const episodes = await animevietsubScraper.getLatestEpisodes(10);

    if (!episodes || episodes.length === 0) {
      await interaction.editReply({
        content: "❌ Không lấy được dữ liệu anime từ AnimeVietsub vào lúc này.",
      });
      return;
    }

    let targetEpisode = episodes[0];
    let targetDetail: AnimeDetailData | null = null;
    let targetMetadata: AniListMetadata | null = null;

    for (const ep of episodes) {
      const detail = await animevietsubScraper.getAnimeDetails(ep.animeUrl).catch(() => null);
      if (isChineseAnimation(detail, null)) continue;

      const extraCandidates = detail?.subTitle
        ? detail.subTitle.split(/[,;]/).map((s) => s.trim())
        : undefined;

      const metadata = await Promise.race([
        anilistService.enrich(ep.animeTitle, ep.animeUrl, extraCandidates),
        new Promise<null>((r) => setTimeout(() => r(null), 3000)),
      ]).catch(() => null);

      if (isChineseAnimation(detail, metadata)) continue;

      targetEpisode = ep;
      targetDetail = detail;
      targetMetadata = metadata;
      break;
    }

    if (!targetDetail && !targetMetadata) {
      targetDetail = await animevietsubScraper.getAnimeDetails(targetEpisode.animeUrl).catch(() => null);
      targetMetadata = await anilistService.enrich(targetEpisode.animeTitle, targetEpisode.animeUrl).catch(() => null);
    }

    const payload = DiscordAnimeEmbedBuilder.buildAnimeNotification(targetEpisode, targetMetadata, targetDetail);
    await interaction.editReply(payload as any);
  },
};

