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
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { EnrichedChapterNotification, MangaDetail } from "../crawler/types";

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
   * Builds Component V2 search results with interactive dropdown selection.
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

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("select_manga_detail")
        .setPlaceholder("📖 Chọn truyện để xem chi tiết tác phẩm...")
        .addOptions(
          results.slice(0, 10).map((r) => ({
            label: (r.name || "Không rõ tên").substring(0, 100),
            value: String(r.id),
            description: (r.author_name ? `Tác giả: ${r.author_name}` : "Xem thông tin chi tiết & danh sách chương").substring(0, 100),
            emoji: "📖",
          }))
        );

      const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      container.addActionRowComponents(actionRow);
    }

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2 as any,
    };
  }

  /**
   * Builds Component V2 detail card for a selected manga.
   */
  public static buildMangaDetailCard(manga: MangaDetail) {
    const accentColor = parseHexColor(manga.panorama_dominant_color);
    const container = new ContainerBuilder().setAccentColor(accentColor);

    // 1. Panoramic Wide Banner at top if available
    const panoramaUrl = manga.panorama_url || manga.panorama_mobile_url;
    if (panoramaUrl) {
      const gallery = new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(panoramaUrl).setDescription(manga.name)
      );
      container.addMediaGalleryComponents(gallery);
    }

    const mangaUrl = manga.official_url || `https://cuutruyen.net/mangas/${manga.id}`;
    const altTitles = manga.titles && manga.titles.length > 0
      ? manga.titles.filter(t => !t.primary && t.name !== manga.name).map(t => t.name).slice(0, 2).join(" • ")
      : "";
    const altTitlesLine = altTitles ? `\n*${altTitles}*` : "";

    const titleText = `## 📖 [${manga.name}](${mangaUrl})${altTitlesLine}`;

    // 2. Header Section with Book Cover Thumbnail Accessory
    const coverUrl = manga.cover_url || manga.cover_mobile_url;
    if (coverUrl) {
      const headerSection = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(coverUrl).setDescription(manga.name)
        );
      container.addSectionComponents(headerSection);
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // 3. Description
    const rawDesc = manga.full_description || manga.description || "Chưa có tóm tắt cho bộ truyện này.";
    const cleanDesc = rawDesc.replace(/<[^>]+>/g, "").trim();
    const descriptionSnippet =
      cleanDesc.length > 350
        ? cleanDesc.substring(0, 347) + "..."
        : cleanDesc;

    // 4. Tags
    const tagsDisplay =
      manga.tags && manga.tags.length > 0
        ? manga.tags.slice(0, 8).map((t) => `\`${t.name}\``).join(" ")
        : "Không có";

    // 5. Metadata
    const latestChapterText = manga.newest_chapter_number
      ? `Chapter ${manga.newest_chapter_number}`
      : "Đang cập nhật";
    const viewsText = manga.views_count != null ? manga.views_count.toLocaleString() : "Đang cập nhật";
    const chaptersText = manga.chapters_count != null ? `${manga.chapters_count} chương` : "Đang cập nhật";

    const detailsText = new TextDisplayBuilder().setContent(
      `> *${descriptionSnippet}*\n\n` +
        `👤 **Tác giả:** ${manga.author?.name || "Đang cập nhật"}\n` +
        `👥 **Nhóm dịch:** ${manga.team?.name || "Cứu Truyện"}\n` +
        `🏷️ **Thể loại:** ${tagsDisplay}\n` +
        `📚 **Số chương:** ${chaptersText} • ⚡ **Mới nhất:** ${latestChapterText}\n` +
        `👁️ **Lượt xem:** ${viewsText}`
    );
    container.addTextDisplayComponents(detailsText);

    // 6. Interactive Action Buttons
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("📖 Đọc Truyện Trên Cuutruyen")
        .setStyle(ButtonStyle.Link)
        .setURL(mangaUrl),
      new ButtonBuilder()
        .setLabel("🌐 Trang Chủ Cuutruyen")
        .setStyle(ButtonStyle.Link)
        .setURL("https://cuutruyen.net")
    );
    container.addActionRowComponents(actionRow);

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2 as any,
    };
  }

  /**
   * Builds Component V2 system status card for all 4 trackers.
   */
  public static buildStatus(statusData: {
    isLoggedIn: boolean;
    userId: number | null;
    mangaChannelsCount: number;
    mangaChaptersCount: number;
    animeChannelsCount: number;
    animeEpisodesCount: number;
    lnChannelsCount: number;
    lnChaptersCount: number;
    manhwaChannelsCount: number;
    manhwaChaptersCount: number;
    pollInterval: number;
    uptimeSeconds: number;
    crawlerMode: string;
    animeDomain?: string | null;
    manhwaDomain?: string | null;
  }) {
    const hours = Math.floor(statusData.uptimeSeconds / 3600);
    const minutes = Math.floor((statusData.uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(statusData.uptimeSeconds % 60);
    const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

    const container = new ContainerBuilder().setAccentColor(0x4dba87);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## 📊 Trạng Thái Hệ Thống & Bộ Tứ Trackers")
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const animeDomainStr = statusData.animeDomain ? ` • \`${statusData.animeDomain}\`` : "";
    const manhwaDomainStr = statusData.manhwaDomain ? ` • \`${statusData.manhwaDomain}\`` : "";

    const statusText =
      `🌐 **Kết nối Cuutruyen:** ${
        statusData.isLoggedIn
          ? `✅ Đã đăng nhập (User ID: \`${statusData.userId}\`)`
          : "⚠️ Chưa đăng nhập / Guest"
      }\n` +
      `⚙️ **Chế độ UI:** \`Discord Components V2\`\n` +
      `⏳ **Thời gian hoạt động:** \`${uptimeStr}\`\n\n` +
      `### 📊 Thống Kê Hoạt Động Bộ Tứ Trackers:\n` +
      `📚 **Cuutruyen (Manga):** \`${statusData.mangaChannelsCount}\` kênh • \`${statusData.mangaChaptersCount}\` chương đã lưu\n` +
      `🎬 **AnimeVietsub (Anime):** \`${statusData.animeChannelsCount}\` kênh • \`${statusData.animeEpisodesCount}\` tập đã lưu${animeDomainStr}\n` +
      `📖 **Hako (Light Novel):** \`${statusData.lnChannelsCount}\` kênh • \`${statusData.lnChaptersCount}\` chương đã lưu\n` +
      `🇰🇷 **TruyenQQ (Manhwa):** \`${statusData.manhwaChannelsCount}\` kênh • \`${statusData.manhwaChaptersCount}\` chapter đã lưu${manhwaDomainStr}`;

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(statusText));

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2 as any,
    };
  }
}
