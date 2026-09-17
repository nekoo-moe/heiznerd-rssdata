import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { DiscordLnEmbedBuilder } from "../lnEmbedBuilder";
import { hakoScraper } from "../../ln";
import { BotCommand } from "../types";

export const lnLatestCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ln-latest")
    .setDescription("📚 Xem danh sách các chương Light Novel mới cập nhật từ Hako")
    .addIntegerOption((option) =>
      option
        .setName("count")
        .setDescription("Số lượng Light Novel muốn hiển thị (1 - 5)")
        .setMinValue(1)
        .setMaxValue(5)
        .setRequired(false)
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const count = interaction.options.getInteger("count") || 3;
    const chapters = await hakoScraper.getLatestChapters(count);

    if (!chapters || chapters.length === 0) {
      await interaction.editReply({
        content: "❌ Không lấy được dữ liệu Light Novel từ Hako vào lúc này.",
      });
      return;
    }

    const targetChapters = chapters.slice(0, count);
    const enrichedList = await Promise.all(
      targetChapters.map(async (ch) => {
        const detail = await hakoScraper.getNovelDetails(ch.seriesUrl).catch(() => null);
        if (detail?.title) {
          ch.seriesTitle = detail.title;
        }
        return { item: ch, detail };
      })
    );

    const payload = DiscordLnEmbedBuilder.buildLnLatestCards(enrichedList);
    await interaction.editReply(payload as any);
  },
};

