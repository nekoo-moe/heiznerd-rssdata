import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { GuildRepository } from "../../database/repositories/guildRepo";
import { BotCommand } from "../types";

export const setChannelCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("setchannel")
    .setDescription("Chọn kênh nhận thông báo truyện mới từ Cuutruyen.net")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Kênh text bạn muốn nhận thông báo")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Chế độ thông báo")
        .setRequired(false)
        .addChoices(
          { name: "Tất cả truyện mới cập nhật", value: "all" },
          { name: "Chỉ truyện tài khoản đang theo dõi", value: "following" }
        )
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
    const mode = (interaction.options.getString("mode") as "all" | "following") || "all";

    GuildRepository.setChannel(interaction.guildId, channel.id, mode);

    const modeText =
      mode === "following"
        ? "🌟 Chỉ truyện đang theo dõi"
        : "🌐 Tất cả truyện mới cập nhật";

    await interaction.reply({
      content: `✅ **Đã cài đặt thành công!**\n📢 Kênh nhận thông báo: <#${channel.id}>\n⚙️ Chế độ: **${modeText}**\n\nMỗi khi có chapter mới trên Cuutruyen, bot sẽ tự động gửi thông báo kèm nút đọc tại đây!`,
    });
  },
};

