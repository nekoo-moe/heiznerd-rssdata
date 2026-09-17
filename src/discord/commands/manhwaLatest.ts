import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { DiscordManhwaEmbedBuilder } from "../manhwaEmbedBuilder";
import { truyenqqScraper } from "../../manhwa";
import { BotCommand } from "../types";

export const manhwaLatestCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("manhwa-latest")
    .setDescription("📚 Xem danh sách các chương Manhwa mới cập nhật từ TruyenQQ")
    .addIntegerOption((option) =>
      option
        .setName("count")
        .setDescription("Số lượng Manhwa muốn hiển thị (1 - 5)")
        .setMinValue(1)
        .setMaxValue(5)
        .setRequired(false)
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const count = interaction.options.getInteger("count") || 3;
    const chapters = await truyenqqScraper.getLatestManhwa(count);

    if (!chapters || chapters.length === 0) {
      await interaction.editReply({
        content: "❌ Không lấy được dữ liệu Manhwa từ TruyenQQ vào lúc này.",
      });
      return;
    }

    const targetChapters = chapters.slice(0, count);
    const enrichedList = await Promise.all(
      targetChapters.map(async (ch) => {
        const detail = await truyenqqScraper.getManhwaDetails(ch.manhwaUrl).catch(() => null);
        return { item: ch, detail };
      })
    );

    const payload = DiscordManhwaEmbedBuilder.buildManhwaLatestCards(enrichedList);
    await interaction.editReply(payload as any);
  },
};

