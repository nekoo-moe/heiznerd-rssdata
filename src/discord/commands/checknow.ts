import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { animeCrawlerManager } from "../../anime";
import { crawlerManager } from "../../crawler/crawlerManager";
import { lnCrawlerManager } from "../../ln";
import { manhwaCrawlerManager } from "../../manhwa";
import { BotCommand } from "../types";

export const checkNowCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("checknow")
    .setDescription("🔄 Kích hoạt quét cập nhật mới ngay lập tức (Bộ Tứ: Manga, Anime, LN, Manhwa)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const [mangaResult, animeResult, lnResult, manhwaResult] = await Promise.all([
      crawlerManager.checkUpdates(false).catch((err) => ({
        checkedCount: 0,
        newChaptersCount: 0,
        error: err.message,
      })),
      animeCrawlerManager.checkUpdates(false).catch((err) => ({
        checkedCount: 0,
        newEpisodesCount: 0,
        error: err.message,
      })),
      lnCrawlerManager.checkUpdates(false).catch((err) => ({
        checkedCount: 0,
        newChaptersCount: 0,
        error: err.message,
      })),
      manhwaCrawlerManager.checkUpdates(false).catch((err) => ({
        checkedCount: 0,
        newChaptersCount: 0,
        error: err.message,
      })),
    ]);

    const mangaStatus =
      mangaResult.newChaptersCount > 0
        ? `🎉 **${mangaResult.newChaptersCount}** chapter mới`
        : "không có chapter mới";
    const animeStatus =
      animeResult.newEpisodesCount > 0
        ? `🎉 **${animeResult.newEpisodesCount}** tập mới`
        : "không có tập mới";
    const lnStatus =
      lnResult.newChaptersCount > 0
        ? `🎉 **${lnResult.newChaptersCount}** chương mới`
        : "không có chương mới";
    const manhwaStatus =
      manhwaResult.newChaptersCount > 0
        ? `🎉 **${manhwaResult.newChaptersCount}** chapter mới`
        : "không có chapter mới";

    const content = [
      "✅ **Quét cập nhật hoàn tất trên Bộ Tứ Trackers!**",
      `📚 **Cuutruyen (Manga):** Đã kiểm tra **${mangaResult.checkedCount}** truyện (${mangaStatus}).`,
      `🎬 **AnimeVietsub (Anime):** Đã kiểm tra **${animeResult.checkedCount}** anime (${animeStatus}).`,
      `📖 **Hako (Light Novel):** Đã kiểm tra **${lnResult.checkedCount}** truyện (${lnStatus}).`,
      `🇰🇷 **TruyenQQ (Manhwa):** Đã kiểm tra **${manhwaResult.checkedCount}** manhwa (${manhwaStatus}).`,
    ].join("\n");

    await interaction.editReply({ content });
  },
};

