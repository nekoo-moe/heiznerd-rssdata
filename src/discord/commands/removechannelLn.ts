import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { GuildLnRepository } from "../../database/repositories/guildLnRepo";
import { BotCommand } from "../types";

export const removeChannelLnCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ln-removechannel")
    .setDescription("🔕 Hủy kênh nhận thông báo Light Novel trên máy chủ này")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ Lệnh này chỉ có thể sử dụng trong máy chủ Discord!",
        ephemeral: true,
      });
      return;
    }

    const removed = GuildLnRepository.removeChannel(interaction.guildId);

    if (removed) {
      await interaction.reply({
        content: "✅ Đã hủy nhận thông báo Light Novel trên máy chủ này.",
      });
    } else {
      await interaction.reply({
        content: "ℹ️ Máy chủ này hiện chưa cài đặt kênh nhận thông báo Light Novel nào.",
        ephemeral: true,
      });
    }
  },
};

