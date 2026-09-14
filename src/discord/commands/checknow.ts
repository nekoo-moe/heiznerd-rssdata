import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { crawlerManager } from "../../crawler/crawlerManager";
import { BotCommand } from "../types";

export const checkNowCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("checknow")
    .setDescription("Quét kiểm tra truyện mới trên Cuutruyen ngay lập tức")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const result = await crawlerManager.checkUpdates(false);

    if (result.newChaptersCount > 0) {
      await interaction.editReply({
        content: `✅ Quét hoàn tất! Đã tìm thấy và gửi thông báo cho **${result.newChaptersCount}** chapter mới.`,
      });
    } else {
      await interaction.editReply({
        content: `ℹ️ Quét hoàn tất: Đã kiểm tra **${result.checkedCount}** truyện gần nhất, không có chapter mới nào kể từ lần quét trước.`,
      });
    }
  },
};

