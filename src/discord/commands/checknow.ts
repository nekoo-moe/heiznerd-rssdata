import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { animeCrawlerManager } from "../../anime";
import { crawlerManager } from "../../crawler/crawlerManager";
import { BotCommand } from "../types";

export const checkNowCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("checknow")
    .setDescription("🔄 Kích hoạt quét cập nhật mới ngay lập tức (Manga & Anime)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const [mangaResult, animeResult] = await Promise.all([
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
    ]);

    const mangaStatus =
      mangaResult.newChaptersCount > 0
        ? `🎉 **${mangaResult.newChaptersCount}** chapter mới`
        : "không có chapter mới";
    const animeStatus =
      animeResult.newEpisodesCount > 0
        ? `🎉 **${animeResult.newEpisodesCount}** tập mới`
        : "không có tập mới";

    const content = [
      "✅ **Quét cập nhật hoàn tất!**",
      `📚 **Cuutruyen (Manga):** Đã kiểm tra **${mangaResult.checkedCount}** truyện (${mangaStatus}).`,
      `🎬 **AnimeVietsub (Anime):** Đã kiểm tra **${animeResult.checkedCount}** anime (${animeStatus}).`,
    ].join("\n");

    await interaction.editReply({ content });
  },
};

