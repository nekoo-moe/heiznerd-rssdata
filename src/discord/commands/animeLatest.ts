import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { animevietsubScraper, anilistService, isChineseAnimation, AnimeEpisodeItem, AnimeDetailData, AniListMetadata } from "../../anime";
import { DiscordAnimeEmbedBuilder } from "../animeEmbedBuilder";
import { BotCommand } from "../types";

export const animeLatestCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("anime-latest")
    .setDescription("🎬 Xem danh sách các tập anime mới cập nhật từ AnimeVietsub")
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
    const episodes = await animevietsubScraper.getLatestEpisodes(Math.min(25, count * 3));

    if (!episodes || episodes.length === 0) {
      await interaction.editReply({
        content: "❌ Không lấy được dữ liệu anime từ AnimeVietsub vào lúc này.",
      });
      return;
    }

    const items: Array<{
      episode: AnimeEpisodeItem;
      metadata: AniListMetadata | null;
      detail?: AnimeDetailData | null;
    }> = [];

    for (const ep of episodes) {
      if (items.length >= count) break;

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

      items.push({ episode: ep, metadata, detail });
    }

    const payload = DiscordAnimeEmbedBuilder.buildAnimeLatestCards(items);
    await interaction.editReply(payload as any);
  },
};

