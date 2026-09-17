import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { GuildRepository } from "../../database/repositories/guildRepo";
import { BotCommand } from "../types";

export const mangaRemoveChannelCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("manga-removechannel")
    .setDescription("🔕 Hủy kênh nhận thông báo truyện tranh trên máy chủ này")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ Lệnh này chỉ có thể sử dụng trong máy chủ Discord!",
        ephemeral: true,
      });
      return;
    }

    const removed = GuildRepository.removeChannel(interaction.guildId);

    if (removed) {
      await interaction.reply({
        content: "✅ Đã hủy nhận thông báo truyện mới trên server này.",
      });
    } else {
      await interaction.reply({
        content: "ℹ️ Server này hiện chưa được cài đặt kênh nhận thông báo nào.",
        ephemeral: true,
      });
    }
  },
};

