import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { GuildLnRepository } from "../../database/repositories/guildLnRepo";
import { BotCommand } from "../types";

export const setChannelLnCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ln-setchannel")
    .setDescription("🔔 Cài đặt kênh nhận thông báo chương Light Novel mới từ Hako")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Kênh text bạn muốn nhận thông báo Light Novel")
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
    GuildLnRepository.setChannel(interaction.guildId, channel.id);

    await interaction.reply({
      content: `✅ **Đã cài đặt thành công!**\n📖 Kênh nhận thông báo Light Novel: <#${channel.id}>\n\nMỗi khi có chương truyện mới được dịch và đăng tải trên Cổng Light Novel (Hako), bot sẽ tự động gửi thông báo kèm nút đọc tại đây!`,
    });
  },
};

