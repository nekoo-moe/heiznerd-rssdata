import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { GuildManhwaRepository } from "../../database/repositories/guildManhwaRepo";
import { BotCommand } from "../types";

export const setChannelManhwaCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("manhwa-setchannel")
    .setDescription("🔔 Cài đặt kênh nhận thông báo chương Manhwa mới từ TruyenQQ")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Kênh text bạn muốn nhận thông báo Manhwa")
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
    GuildManhwaRepository.setChannel(interaction.guildId, channel.id);

    await interaction.reply({
      content: `✅ **Đã cài đặt thành công!**\n🇰🇷 Kênh nhận thông báo Manhwa: <#${channel.id}>\n\nMỗi khi có chapter mới trên TruyenQQ (lọc chuẩn truyện tranh Hàn Quốc), bot sẽ tự động gửi thông báo kèm nút đọc tại đây!`,
    });
  },
};

