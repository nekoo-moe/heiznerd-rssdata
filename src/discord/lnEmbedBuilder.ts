/**
 * src/discord/lnEmbedBuilder.ts
 * Discord Components V2 message builder for Light Novel (Hako / Docln).
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
import { LnChapterItem, LnDetailData, LnSearchResult } from "../ln/types";

const LN_ACCENT_COLOR = 0x1976d2; // Premium Blue for Light Novels

export class DiscordLnEmbedBuilder {
  /**
   * Builds Discord Component V2 message for a new Light Novel chapter alert or /ln-newest command.
   */
  public static buildLnNotification(item: LnChapterItem, detail?: LnDetailData | null) {
    const container = new ContainerBuilder().setAccentColor(LN_ACCENT_COLOR);

    const seriesTitle = detail?.title || item.seriesTitle;
    const chapterText = item.chapterTitle ? `**${item.chapterTitle}**` : "Chương mới";
    const titleText = `## 📖 [MỚI] [${seriesTitle}](${item.seriesUrl})\n🎉 ${chapterText} vừa cập nhật chương mới trên **Cổng Light Novel (Hako)**!`;

    const coverUrl = detail?.coverUrl || item.coverUrl;
    if (coverUrl) {
      const headerSection = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(coverUrl).setDescription(seriesTitle)
        );
      container.addSectionComponents(headerSection);
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const volText = item.volumeTitle ? `📚 **Tập:** ${item.volumeTitle} • ` : "";
    const authorText = detail?.author ? `👤 **Tác giả:** ${detail.author} • ` : "";
    const translatorText = detail?.translator ? `👥 **Dịch giả:** ${detail.translator}\n` : "";
    const authorTranslatorLine = (authorText || translatorText) ? `${authorText}${translatorText}` : "";

    const genresList = detail?.genres && detail.genres.length > 0 ? detail.genres : [];
    const genresDisplay =
      genresList.length > 0
        ? `🏷️ **Thể loại:** ${genresList.slice(0, 6).map((g) => `\`${g}\``).join(" ")}\n`
        : "";

    const scoreDisplay = detail?.rating ? `⭐ **Đánh giá:** ${detail.rating}` : "";
    const viewsDisplay = detail?.views ? `👁️ **Lượt xem:** ${detail.views}` : "";
    const wordsDisplay = detail?.wordCount ? `📝 **Số từ:** ${detail.wordCount}` : "";
    const statsList = [scoreDisplay, viewsDisplay, wordsDisplay].filter(Boolean);
    const statsLine = statsList.length > 0 ? `${statsList.join(" • ")}\n` : "";

    const descSnippet = detail?.description
      ? `> *${detail.description.length > 220 ? detail.description.substring(0, 217) + "..." : detail.description}*\n\n`
      : "";

    const detailsText = new TextDisplayBuilder().setContent(
      descSnippet +
        authorTranslatorLine +
        genresDisplay +
        statsLine +
        `${volText}🕒 **Cập nhật:** Vừa xong trên Cổng Light Novel (Hako)`
    );

    container.addTextDisplayComponents(detailsText);

    // Action buttons
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("📖 Đọc Chương Này")
        .setStyle(ButtonStyle.Link)
        .setURL(item.chapterUrl),
      new ButtonBuilder()
        .setLabel("ℹ️ Chi Tiết Truyện")
        .setStyle(ButtonStyle.Link)
        .setURL(item.seriesUrl)
    );

    container.addActionRowComponents(actionRow);

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2 as any,
    };
  }

  /**
   * Builds Discord Component V2 containers for /ln-latest command (up to 5 novels).
   */
  public static buildLnLatestCards(
    items: Array<{ item: LnChapterItem; detail?: LnDetailData | null } | LnChapterItem>
  ) {
    if (items.length === 0) {
      const emptyContainer = new ContainerBuilder()
        .setAccentColor(LN_ACCENT_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## 📖 Light Novel Mới Cập Nhật - Hako\nHiện không có chương Light Novel mới nào."
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

      const container = new ContainerBuilder().setAccentColor(LN_ACCENT_COLOR);

      const seriesTitle = detail?.title || item.seriesTitle;
      const headerText = `### ${idx + 1}. [${seriesTitle}](${item.seriesUrl})\n🎉 **${item.chapterTitle}** vừa cập nhật chương mới!`;

      const coverUrl = detail?.coverUrl || item.coverUrl;
      if (coverUrl) {
        const section = new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(coverUrl).setDescription(seriesTitle)
          );
        container.addSectionComponents(section);
      } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText));
      }

      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

      const rawDesc = detail?.description;
      const descSnippet = rawDesc
        ? `> *${rawDesc.length > 200 ? rawDesc.substring(0, 197) + "..." : rawDesc}*\n\n`
        : "";

      const authorText = detail?.author ? `👤 **Tác giả:** ${detail.author} • ` : "";
      const translatorText = detail?.translator ? `👥 **Dịch giả:** ${detail.translator}\n` : "";
      const authorTranslatorLine = (authorText || translatorText) ? `${authorText}${translatorText}` : "";

      const volText = item.volumeTitle ? `📚 **Tập:** ${item.volumeTitle} • ` : "";

      const genresList = detail?.genres && detail.genres.length > 0 ? detail.genres : [];
      const genresDisplay =
        genresList.length > 0
          ? `🏷️ **Thể loại:** ${genresList.slice(0, 5).map((g) => `\`${g}\``).join(" ")}\n`
          : "";

      const scoreDisplay = detail?.rating ? `⭐ **Đánh giá:** ${detail.rating}` : "";
      const viewsDisplay = detail?.views ? `👁️ **Lượt xem:** ${detail.views}` : "";
      const wordsDisplay = detail?.wordCount ? `📝 **Số từ:** ${detail.wordCount}` : "";
      const statsList = [scoreDisplay, viewsDisplay, wordsDisplay].filter(Boolean);
      const statsLine = statsList.length > 0 ? `${statsList.join(" • ")}\n` : "";

      const details = new TextDisplayBuilder().setContent(
        descSnippet +
          authorTranslatorLine +
          genresDisplay +
          statsLine +
          `${volText}🕒 **Cập nhật:** Vừa xong trên Cổng Light Novel (Hako)`
      );
      container.addTextDisplayComponents(details);

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("📖 Đọc Chương Này")
          .setStyle(ButtonStyle.Link)
          .setURL(item.chapterUrl),
        new ButtonBuilder()
          .setLabel("ℹ️ Chi Tiết Truyện")
          .setStyle(ButtonStyle.Link)
          .setURL(item.seriesUrl)
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
   * Builds Component V2 search results for Light Novels with interactive dropdown selection.
   */
  public static buildLnSearchResults(query: string, results: LnSearchResult[]) {
    const container = new ContainerBuilder().setAccentColor(LN_ACCENT_COLOR);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## 🔍 Kết Quả Tìm Kiếm Light Novel: "${query}"`)
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (results.length === 0) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("Không tìm thấy Light Novel nào khớp với từ khóa.")
      );
    } else {
      const listContent = results
        .slice(0, 10)
        .map((r, i) => {
          const chText = r.latestChapter ? ` • **${r.latestChapter}**` : "";
          return `**${i + 1}. [${r.title}](${r.seriesUrl})**${chText}`;
        })
        .join("\n\n");

      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(listContent));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("select_ln_detail")
        .setPlaceholder("📖 Chọn Light Novel để xem chi tiết tác phẩm...")
        .addOptions(
          results.slice(0, 10).map((r) => ({
            label: (r.title || "Không rõ tên").substring(0, 100),
            value: r.seriesUrl.substring(0, 100),
            description: (r.latestChapter || "Xem thông tin chi tiết & các tập truyện").substring(0, 100),
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
   * Builds Component V2 detail card for a selected Light Novel.
   */
  public static buildLnDetailCard(detail: LnDetailData) {
    const container = new ContainerBuilder().setAccentColor(LN_ACCENT_COLOR);

    const titleText = `## 📖 [${detail.title}](${detail.seriesUrl})`;

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

    const rawDesc = detail.description || "Chưa có tóm tắt cho bộ Light Novel này.";
    const descSnippet =
      rawDesc.length > 350 ? rawDesc.substring(0, 347) + "..." : rawDesc;

    const authorDisplay = detail.author ? `👤 **Tác giả:** ${detail.author}\n` : "";
    const illustratorDisplay = detail.illustrator ? `🎨 **Họa sĩ:** ${detail.illustrator}\n` : "";
    const translatorDisplay = detail.translator ? `👥 **Dịch giả:** ${detail.translator}\n` : "";
    const statusDisplay = detail.status ? `📌 **Tình trạng:** ${detail.status}\n` : "";

    const metaParts = [];
    if (detail.wordCount) metaParts.push(`📝 **Số từ:** ${detail.wordCount}`);
    if (detail.rating) metaParts.push(`⭐ **Đánh giá:** ${detail.rating}`);
    if (detail.views) metaParts.push(`👁️ **Lượt xem:** ${detail.views}`);
    const metaLine = metaParts.length > 0 ? `${metaParts.join(" • ")}\n` : "";

    const genresDisplay =
      detail.genres && detail.genres.length > 0
        ? `🏷️ **Thể loại:** ${detail.genres.slice(0, 8).map((g) => `\`${g}\``).join(" ")}\n`
        : "";

    const detailsText = new TextDisplayBuilder().setContent(
      `> *${descSnippet}*\n\n` +
        authorDisplay +
        illustratorDisplay +
        translatorDisplay +
        statusDisplay +
        metaLine +
        genresDisplay
    );

    container.addTextDisplayComponents(detailsText);

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("📖 Đọc Truyện Trên Hako")
        .setStyle(ButtonStyle.Link)
        .setURL(detail.seriesUrl),
      new ButtonBuilder()
        .setLabel("🌐 Cổng Light Novel")
        .setStyle(ButtonStyle.Link)
        .setURL("https://ln.hako.vn")
    );

    container.addActionRowComponents(actionRow);

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2 as any,
    };
  }
}

