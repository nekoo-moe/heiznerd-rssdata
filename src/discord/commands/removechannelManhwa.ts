import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { GuildManhwaRepository } from "../../database/repositories/guildManhwaRepo";
import { BotCommand } from "../types";

export const removeChannelManhwaCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("manhwa-removechannel")
    .setDescription("🔕 Hủy kênh nhận thông báo Manhwa trên máy chủ này")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ Lệnh này chỉ có thể sử dụng trong máy chủ Discord!",
        ephemeral: true,
      });
      return;
    }

    const removed = GuildManhwaRepository.removeChannel(interaction.guildId);

    if (removed) {
      await interaction.reply({
        content: "✅ Đã hủy nhận thông báo Manhwa trên máy chủ này.",
      });
    } else {
      await interaction.reply({
        content: "ℹ️ Máy chủ này hiện chưa cài đặt kênh nhận thông báo Manhwa nào.",
        ephemeral: true,
      });
    }
  },
};

