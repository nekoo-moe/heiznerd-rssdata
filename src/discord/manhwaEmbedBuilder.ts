/**
 * src/discord/manhwaEmbedBuilder.ts
 * Discord Components V2 message builder for Manhwa (TruyenQQ).
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { truyenqqDomainResolver } from "../manhwa/domainResolver";
import { ManhwaChapterItem, ManhwaDetailData, ManhwaSearchResult } from "../manhwa/types";

const MANHWA_ACCENT_COLOR = 0x8e24aa; // Vibrant Purple / Violet for Manhwa & Webtoons

export class DiscordManhwaEmbedBuilder {
  /**
   * Builds Discord Component V2 message for a new Manhwa chapter alert or /manhwa-newest command.
   */
  public static buildManhwaNotification(item: ManhwaChapterItem, detail?: ManhwaDetailData | null) {
    const container = new ContainerBuilder().setAccentColor(MANHWA_ACCENT_COLOR);

    const chapterText = item.chapterTitle ? `**${item.chapterTitle}**` : "Chapter mới";
    const titleText = `## 🇰🇷 [MỚI] [${item.manhwaTitle}](${item.manhwaUrl})\n🎉 ${chapterText} vừa ra mắt trên **TruyenQQ**!`;

    const coverUrl = detail?.coverUrl || item.coverUrl;
    if (coverUrl) {
      const headerSection = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(coverUrl).setDescription(item.manhwaTitle)
        );
      container.addSectionComponents(headerSection);
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const otherName = detail?.otherName || item.otherName;
    const showOther =
      otherName &&
      otherName.toLowerCase() !== (detail?.title || item.manhwaTitle).toLowerCase() &&
      otherName.replace(/\s+/g, "").toLowerCase() !== (detail?.title || item.manhwaTitle).replace(/\s+/g, "").toLowerCase();
    const otherNameText = showOther ? `✨ **Tên khác:** *${otherName}*\n` : "";

    const authorText = detail?.author ? `👤 **Tác giả:** ${detail.author} • ` : "";
    const statusText = detail?.status ? `📊 **Tình trạng:** ${detail.status}\n` : "";
    const authorStatusLine = (authorText || statusText) ? `${authorText}${statusText}` : "";

    const genresList = detail?.genres && detail.genres.length > 0 ? detail.genres : ["Manhwa"];
    const genresDisplay = `🏷️ **Thể loại:** ${genresList.slice(0, 6).map((g) => `\`${g}\``).join(" ")}\n`;

    const viewsPart = detail?.views ? `👁️ **Lượt xem:** ${detail.views}` : "";
    const followsPart = detail?.followers ? `❤️ **Theo dõi:** ${detail.followers}` : "";
    const chapsPart = detail?.totalChapters ? `📑 **Tổng số chap:** ${detail.totalChapters}` : "";
    const statsList = [viewsPart, followsPart, chapsPart].filter(Boolean);
    const statsLine = statsList.length > 0 ? `${statsList.join(" • ")}\n` : "";

    const descSnippet = detail?.description
      ? `> *${detail.description.length > 220 ? detail.description.substring(0, 217) + "..." : detail.description}*\n\n`
      : "";

    const detailsText = new TextDisplayBuilder().setContent(
      descSnippet +
        otherNameText +
        authorStatusLine +
        genresDisplay +
        statsLine +
        `🕒 **Cập nhật:** ${item.updatedAt || "Vừa xong"} trên TruyenQQ`
    );

    container.addTextDisplayComponents(detailsText);

    // Action buttons
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("📖 Đọc Chapter Này")
        .setStyle(ButtonStyle.Link)
        .setURL(item.chapterUrl),
      new ButtonBuilder()
        .setLabel("ℹ️ Chi Tiết Manhwa")
        .setStyle(ButtonStyle.Link)
        .setURL(item.manhwaUrl)
    );

    container.addActionRowComponents(actionRow);

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2 as any,
    };
  }

  /**
   * Builds Discord Component V2 containers for /manhwa-latest command (up to 5 manhwa).
   */
  public static buildManhwaLatestCards(
    items: Array<{ item: ManhwaChapterItem; detail?: ManhwaDetailData | null } | ManhwaChapterItem>
  ) {
    if (items.length === 0) {
      const emptyContainer = new ContainerBuilder()
        .setAccentColor(MANHWA_ACCENT_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## 🇰🇷 Manhwa Mới Cập Nhật - TruyenQQ\nHiện không có chương Manhwa mới nào."
          )
        );
      return {
        components: [emptyContainer],
        flags: MessageFlags.IsComponentsV2 as any,
      };
    }

    const containers: ContainerBuilder[] = items.slice(0, 5).map((entry, idx) => {
      const item = "item" in entry ? entry.item : entry;
      const detail = "detail" in entry ? entry.detail : null;

      const container = new ContainerBuilder().setAccentColor(MANHWA_ACCENT_COLOR);

      const title = detail?.title || item.manhwaTitle;
      const headerText = `### ${idx + 1}. [${title}](${item.manhwaUrl})\n🎉 **${item.chapterTitle}** vừa cập nhật!`;

      const coverUrl = detail?.coverUrl || item.coverUrl;
      if (coverUrl) {
        const section = new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(coverUrl).setDescription(title)
          );
        container.addSectionComponents(section);
      } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText));
      }

      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

      const otherName = detail?.otherName || item.otherName;
      const showOther =
        otherName &&
        otherName.toLowerCase() !== title.toLowerCase() &&
        otherName.replace(/\s+/g, "").toLowerCase() !== title.replace(/\s+/g, "").toLowerCase();
      const otherNameText = showOther ? `✨ *${otherName}*\n` : "";

      const rawDesc = detail?.description;
      const descSnippet = rawDesc
        ? `> *${rawDesc.length > 200 ? rawDesc.substring(0, 197) + "..." : rawDesc}*\n\n`
        : "";

      const authorText = detail?.author ? `👤 **Tác giả:** ${detail.author} • ` : "";
      const statusText = detail?.status ? `📊 **Tình trạng:** ${detail.status}\n` : "";
      const authorStatusLine = (authorText || statusText) ? `${authorText}${statusText}` : "";

      const genresList = detail?.genres && detail.genres.length > 0 ? detail.genres : ["Manhwa"];
      const genresDisplay = `🏷️ **Thể loại:** ${genresList.slice(0, 5).map((g) => `\`${g}\``).join(" ")}\n`;

      const viewsPart = detail?.views ? `👁️ **Lượt xem:** ${detail.views}` : "";
      const followsPart = detail?.followers ? `❤️ **Theo dõi:** ${detail.followers}` : "";
      const chapsPart = detail?.totalChapters ? `📑 **Tổng chap:** ${detail.totalChapters}` : "";
      const statsList = [viewsPart, followsPart, chapsPart].filter(Boolean);
      const statsLine = statsList.length > 0 ? `${statsList.join(" • ")}\n` : "";

      const details = new TextDisplayBuilder().setContent(
        descSnippet +
          otherNameText +
          authorStatusLine +
          genresDisplay +
          statsLine +
          `🕒 **Cập nhật:** ${item.updatedAt || "Vừa xong"} trên TruyenQQ`
      );
      container.addTextDisplayComponents(details);

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("📖 Đọc Chapter Này")
          .setStyle(ButtonStyle.Link)
          .setURL(item.chapterUrl),
        new ButtonBuilder()
          .setLabel("ℹ️ Chi Tiết Manhwa")
          .setStyle(ButtonStyle.Link)
          .setURL(item.manhwaUrl)
      );
      container.addActionRowComponents(actionRow);

      return container;
    });

    return {
      components: containers,
      flags: MessageFlags.IsComponentsV2 as any,
    };
  }

  /**
   * Builds Component V2 search results for Manhwa with interactive dropdown selection.
   */
  public static buildManhwaSearchResults(query: string, results: ManhwaSearchResult[]) {
    const container = new ContainerBuilder().setAccentColor(MANHWA_ACCENT_COLOR);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## 🔍 Kết Quả Tìm Kiếm Manhwa: "${query}"`)
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (results.length === 0) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("Không tìm thấy Manhwa nào khớp với từ khóa.")
      );
    } else {
      const listContent = results
        .slice(0, 10)
        .map((r, i) => {
          const chText = r.latestChapter ? ` • **${r.latestChapter}**` : "";
          const otherText = r.otherName ? ` • *${r.otherName}*` : "";
          return `**${i + 1}. [${r.title}](${r.manhwaUrl})**${chText}${otherText}`;
        })
        .join("\n\n");

      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(listContent));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("select_manhwa_detail")
        .setPlaceholder("🇰🇷 Chọn Manhwa để xem chi tiết tác phẩm...")
        .addOptions(
          results.slice(0, 10).map((r) => ({
            label: (r.title || "Không rõ tên").substring(0, 100),
            value: r.manhwaUrl.substring(0, 100),
            description: (r.latestChapter ? `${r.latestChapter} • ${r.otherName || ""}` : "Xem thông tin chi tiết & danh sách chương").substring(0, 100),
            emoji: "🇰🇷",
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
   * Builds Component V2 detail card for a selected Manhwa.
   */
  public static buildManhwaDetailCard(detail: ManhwaDetailData) {
    const container = new ContainerBuilder().setAccentColor(MANHWA_ACCENT_COLOR);

    const otherLine = detail.otherName ? `\n*${detail.otherName}*` : "";
    const titleText = `## 🇰🇷 [${detail.title}](${detail.manhwaUrl})${otherLine}`;

    if (detail.coverUrl) {
      const headerSection = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(detail.coverUrl).setDescription(detail.title)
        );
      container.addSectionComponents(headerSection);
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const rawDesc = detail.description || "Chưa có tóm tắt cho bộ Manhwa này.";
    const descSnippet =
      rawDesc.length > 350 ? rawDesc.substring(0, 347) + "..." : rawDesc;

    const authorDisplay = detail.author ? `👤 **Tác giả:** ${detail.author}\n` : "";
    const statusDisplay = detail.status ? `📌 **Tình trạng:** ${detail.status}\n` : "";
    const latestDisplay = detail.latestChapter ? `⚡ **Mới nhất:** ${detail.latestChapter}\n` : "";
    const viewsDisplay = detail.views ? `👁️ **Lượt xem:** ${detail.views}\n` : "";

    const genresDisplay =
      detail.genres && detail.genres.length > 0
        ? `🏷️ **Thể loại:** ${detail.genres.slice(0, 8).map((g) => `\`${g}\``).join(" ")}\n`
        : "";

    const detailsText = new TextDisplayBuilder().setContent(
      `> *${descSnippet}*\n\n` +
        authorDisplay +
        statusDisplay +
        latestDisplay +
        viewsDisplay +
        genresDisplay
    );

    container.addTextDisplayComponents(detailsText);

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("📖 Đọc Truyện Trên TruyenQQ")
        .setStyle(ButtonStyle.Link)
        .setURL(detail.manhwaUrl),
      new ButtonBuilder()
        .setLabel("🌐 TruyenQQ")
        .setStyle(ButtonStyle.Link)
        .setURL(truyenqqDomainResolver.getActiveDomain())
    );

    container.addActionRowComponents(actionRow);

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2 as any,
    };
  }
}

