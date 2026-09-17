import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { DiscordManhwaEmbedBuilder } from "../manhwaEmbedBuilder";
import { truyenqqScraper } from "../../manhwa";
import { BotCommand } from "../types";

export const manhwaNewestCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("manhwa-newest")
    .setDescription("⚡ Xem ngay chương Manhwa mới nhất vừa ra mắt trên TruyenQQ"),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const chapters = await truyenqqScraper.getLatestManhwa(5);

    if (!chapters || chapters.length === 0) {
      await interaction.editReply({
        content: "❌ Không lấy được dữ liệu Manhwa từ TruyenQQ vào lúc này.",
      });
      return;
    }

    const latest = chapters[0];
    const detail = await truyenqqScraper.getManhwaDetails(latest.manhwaUrl).catch(() => null);

    const payload = DiscordManhwaEmbedBuilder.buildManhwaNotification(latest, detail);
    await interaction.editReply(payload as any);
  },
};

