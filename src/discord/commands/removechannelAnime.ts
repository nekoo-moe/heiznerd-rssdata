import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { GuildAnimeRepository } from "../../database/repositories/guildAnimeRepo";
import { BotCommand } from "../types";

export const animeRemoveChannelCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("anime-removechannel")
    .setDescription("🔕 Hủy kênh nhận thông báo anime trên máy chủ này")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ Lệnh này chỉ có thể sử dụng trong máy chủ Discord!",
        ephemeral: true,
      });
      return;
    }

    const removed = GuildAnimeRepository.removeChannel(interaction.guildId);

    if (removed) {
      await interaction.reply({
        content: "✅ Đã hủy cấu hình kênh thông báo Anime thành công. Máy chủ sẽ không còn nhận thông báo tập mới.",
      });
    } else {
      await interaction.reply({
        content: "ℹ️ Máy chủ này hiện chưa cài đặt kênh nhận thông báo Anime nào.",
        ephemeral: true,
      });
    }
  },
};

