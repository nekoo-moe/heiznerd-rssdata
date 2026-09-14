import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { EnrichedChapterNotification } from "../crawler/types";

function parseHexColor(hex?: string): number {
  if (!hex || !hex.startsWith("#")) return 0x4dba87;
  const cleanHex = hex.replace("#", "");
  const num = parseInt(cleanHex, 16);
  return isNaN(num) ? 0x4dba87 : num;
}

export class DiscordEmbedBuilder {
  /**
   * Builds Discord Component V2 message for a new chapter alert or /newest command.
   */
  public static buildChapterNotification(data: EnrichedChapterNotification) {
    const accentColor = parseHexColor(data.dominantColor);
    const container = new ContainerBuilder().setAccentColor(accentColor);

    const chapterDate = new Date(data.chapterCreatedAt);
    const unixTimestamp = Math.floor(chapterDate.getTime() / 1000);
    const timeDisplay = isNaN(unixTimestamp)
      ? "Vừa xong"
      : `<t:${unixTimestamp}:R> (<t:${unixTimestamp}:f>)`;

    const descriptionSnippet = data.description
      ? data.description.length > 250
        ? data.description.substring(0, 247) + "..."
        : data.description
      : "Chưa có tóm tắt cho bộ truyện này.";

    const tagsDisplay =
      data.tags && data.tags.length > 0
        ? data.tags.slice(0, 8).map((t) => `\`${t}\``).join(" ")
        : "Không có";

    const chapterTitleText = data.chapterTitle ? `: ${data.chapterTitle}` : "";

    // 1. Panoramic Wide Banner at top of Container if available
    if (data.panoramaUrl) {
      const gallery = new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(data.panoramaUrl).setDescription(data.mangaTitle)
      );
      container.addMediaGalleryComponents(gallery);
    }

    const titleText = `## 🔔 [MỚI] [${data.mangaTitle}](${data.mangaUrl})\n🎉 **Chapter ${data.chapterNumber}${chapterTitleText}** vừa được cập nhật trên **Cứu Truyện**!`;

    // 2. Header with Book Cover Thumbnail Accessory if cover image exists
    if (data.coverUrl) {
      const headerSection = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(data.coverUrl).setDescription(data.mangaTitle)
        );
      container.addSectionComponents(headerSection);
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // 2. Metadata Section (Description quote, Author, Team, Tags, Update Time)
    const detailsText = new TextDisplayBuilder().setContent(
      `> *${descriptionSnippet}*\n\n` +
        `👤 **Tác giả:** ${data.authorName || "Đang cập nhật"}\n` +
        `👥 **Nhóm dịch:** ${data.teamName || "Cứu Truyện"}\n` +
        `🏷️ **Thể loại:** ${tagsDisplay}\n` +
        `🕒 **Cập nhật:** ${timeDisplay}`
    );

    container.addTextDisplayComponents(detailsText);

    // 3. Interactive Action Buttons
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(`📖 Đọc Chapter ${data.chapterNumber}`)
        .setStyle(ButtonStyle.Link)
        .setURL(data.chapterUrl),
      new ButtonBuilder()
        .setLabel("ℹ️ Chi Tiết Truyện")
        .setStyle(ButtonStyle.Link)
        .setURL(data.mangaUrl)
    );

    container.addActionRowComponents(actionRow);

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2 as any,
    };
  }

  /**
   * Builds Discord Component V2 containers for /latest command (up to 5 mangas).
   */
  public static buildEnrichedLatestCards(enrichedList: EnrichedChapterNotification[]) {
    if (enrichedList.length === 0) {
      const emptyContainer = new ContainerBuilder()
        .setAccentColor(0x4dba87)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## 📚 Truyện Tranh Mới Cập Nhật - Cuutruyen.net\nHiện không có truyện mới nào được tìm thấy."
          )
        );
      return {
        components: [emptyContainer],
        flags: MessageFlags.IsComponentsV2 as any,
      };
    }

    // Create a Container for each manga (up to 5)
    const containers: ContainerBuilder[] = enrichedList.slice(0, 5).map((item, idx) => {
      const accentColor = parseHexColor(item.dominantColor);
      const container = new ContainerBuilder().setAccentColor(accentColor);

      const chapterDate = new Date(item.chapterCreatedAt);
      const unixTimestamp = Math.floor(chapterDate.getTime() / 1000);
      const timeDisplay = isNaN(unixTimestamp)
        ? "Vừa xong"
        : `<t:${unixTimestamp}:R>`;

      const descriptionSnippet = item.description
        ? item.description.length > 200
          ? item.description.substring(0, 197) + "..."
          : item.description
        : "Chưa có tóm tắt.";

      const tagsDisplay =
        item.tags && item.tags.length > 0
          ? item.tags.slice(0, 6).map((t) => `\`${t}\``).join(" ")
          : "Không có";

      const chapterTitleText = item.chapterTitle ? `: ${item.chapterTitle}` : "";
      const mangaHeader = `### ${idx + 1}. [${item.mangaTitle}](${item.mangaUrl})\n🎉 **Chapter ${item.chapterNumber}${chapterTitleText}** vừa ra mắt!`;

      // 1. Panoramic Wide Banner at top of Container if available
      if (item.panoramaUrl) {
        const gallery = new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(item.panoramaUrl).setDescription(item.mangaTitle)
        );
        container.addMediaGalleryComponents(gallery);
      }

      // 2. Header with Thumbnail if available
      if (item.coverUrl) {
        const section = new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(mangaHeader))
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(item.coverUrl).setDescription(item.mangaTitle)
          );
        container.addSectionComponents(section);
      } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(mangaHeader));
      }

      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

      // Details Text
      const details = new TextDisplayBuilder().setContent(
        `> *${descriptionSnippet}*\n\n` +
          `👤 **Tác giả:** ${item.authorName || "Đang cập nhật"} • 👥 **Nhóm:** ${item.teamName || "Cứu Truyện"}\n` +
          `🏷️ **Thể loại:** ${tagsDisplay}\n` +
          `🕒 **Cập nhật:** ${timeDisplay}`
      );
      container.addTextDisplayComponents(details);

      // Buttons
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel(`📖 Đọc Chapter ${item.chapterNumber}`)
          .setStyle(ButtonStyle.Link)
          .setURL(item.chapterUrl),
        new ButtonBuilder()
          .setLabel("ℹ️ Chi Tiết Truyện")
          .setStyle(ButtonStyle.Link)
          .setURL(item.mangaUrl)
      );
      container.addActionRowComponents(row);

      return container;
    });

    return {
      components: containers,
      flags: MessageFlags.IsComponentsV2 as any,
    };
  }

  /**
   * Builds Component V2 search results.
   */
  public static buildSearchResults(query: string, results: any[]) {
    const container = new ContainerBuilder().setAccentColor(0x4dba87);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## 🔍 Kết Quả Tìm Kiếm: "${query}"`)
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (results.length === 0) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("Không tìm thấy truyện nào khớp với từ khóa.")
      );
    } else {
      const listContent = results
        .slice(0, 10)
        .map((r, i) => {
          const authorText = r.author_name ? ` • *${r.author_name}*` : "";
          return `**${i + 1}. [${r.name}](${r.id ? `https://cuutruyen.net/mangas/${r.id}` : "#"})**${authorText}`;
        })
        .join("\n\n");

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(listContent)
      );
    }

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2 as any,
    };
  }

  /**
   * Builds Component V2 system status card.
   */
  public static buildStatus(statusData: {
    isLoggedIn: boolean;
    userId: number | null;
    configuredChannelsCount: number;
    notifiedChaptersCount: number;
    pollInterval: number;
    uptimeSeconds: number;
    crawlerMode: string;
  }) {
    const hours = Math.floor(statusData.uptimeSeconds / 3600);
    const minutes = Math.floor((statusData.uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(statusData.uptimeSeconds % 60);
    const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

    const container = new ContainerBuilder().setAccentColor(0x4dba87);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## 📊 Trạng Thái Hệ Thống Bot & Crawler")
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const statusText =
      `🌐 **Kết nối Cuutruyen:** ${
        statusData.isLoggedIn
          ? `✅ Đã đăng nhập (User ID: \`${statusData.userId}\`)`
          : "⚠️ Chưa đăng nhập / Guest"
      }\n` +
      `⚙️ **Chế độ UI:** \`Discord Components V2\`\n` +
      `🕷️ **Chế độ Crawler:** \`${statusData.crawlerMode.toUpperCase()}\`\n` +
      `⏱️ **Chu kỳ quét:** \`${statusData.pollInterval}s\`\n` +
      `📢 **Kênh nhận tin:** \`${statusData.configuredChannelsCount} server/kênh\`\n` +
      `📦 **Chapter đã thông báo:** \`${statusData.notifiedChaptersCount} chương\`\n` +
      `⏳ **Thời gian hoạt động:** \`${uptimeStr}\``;

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(statusText));

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2 as any,
    };
  }
}
