import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { GuildAnimeRepository } from "../../database/repositories/guildAnimeRepo";
import { BotCommand } from "../types";

export const setChannelAnimeCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("setchannel-anime")
    .setDescription("Chọn kênh nhận thông báo tập anime mới từ AnimeVietsub")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Kênh text bạn muốn nhận thông báo anime")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ Lệnh này chỉ có thể sử dụng trong máy chủ Discord!",
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel", true);
    GuildAnimeRepository.setChannel(interaction.guildId, channel.id);

    await interaction.reply({
      content: `✅ **Đã cài đặt thành công!**\n🎬 Kênh nhận thông báo Anime: <#${channel.id}>\n\nMỗi khi có tập phim mới trên AnimeVietsub, bot sẽ tự động gửi thông báo kèm ảnh banner panorama và nút xem tập tại đây!`,
    });
  },
};

