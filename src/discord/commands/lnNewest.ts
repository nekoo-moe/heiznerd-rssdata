import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { DiscordLnEmbedBuilder } from "../lnEmbedBuilder";
import { hakoScraper } from "../../ln";
import { BotCommand } from "../types";

export const lnNewestCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ln-newest")
    .setDescription("⚡ Xem ngay chương Light Novel mới nhất vừa cập nhật trên Hako"),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const chapters = await hakoScraper.getLatestChapters(5);

    if (!chapters || chapters.length === 0) {
      await interaction.editReply({
        content: "❌ Không lấy được dữ liệu Light Novel từ Hako vào lúc này.",
      });
      return;
    }

    const latest = chapters[0];
    const detail = await hakoScraper.getNovelDetails(latest.seriesUrl).catch(() => null);
    if (detail?.title) {
      latest.seriesTitle = detail.title;
    }

    const payload = DiscordLnEmbedBuilder.buildLnNotification(latest, detail);
    await interaction.editReply(payload as any);
  },
};

