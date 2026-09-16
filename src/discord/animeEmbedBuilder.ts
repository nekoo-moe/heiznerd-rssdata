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
import { AnimeEpisodeItem, AnimeSearchResult, AniListMetadata } from "../anime/types";

function parseHexColor(hex?: string | null): number {
  if (!hex || !hex.startsWith("#")) return 0x4dba87;
  const cleanHex = hex.replace("#", "");
  const num = parseInt(cleanHex, 16);
  return isNaN(num) ? 0x4dba87 : num;
}

export class DiscordAnimeEmbedBuilder {
  /**
   * Builds Discord Component V2 message for a new anime episode alert or /anime-newest command.
   */
  public static buildAnimeNotification(
    episode: AnimeEpisodeItem,
    metadata: AniListMetadata | null
  ) {
    const accentColor = parseHexColor(metadata?.color);
    const container = new ContainerBuilder().setAccentColor(accentColor);

    const descriptionSnippet = metadata?.description
      ? metadata.description.length > 250
        ? metadata.description.substring(0, 247) + "..."
        : metadata.description
      : "Chưa có tóm tắt cho bộ anime này.";

    const genresDisplay =
      metadata?.genres && metadata.genres.length > 0
        ? metadata.genres.slice(0, 6).map((g) => `\`${g}\``).join(" ")
        : "`Anime`";

    const scoreDisplay = metadata?.averageScore ? `⭐ **${metadata.averageScore}**/100` : "⭐ Đang cập nhật";
    const studioDisplay = metadata?.studio ? `🏢 **Studio:** ${metadata.studio}` : "🏢 **Studio:** Đang cập nhật";

    // 1. Panoramic Wide Banner at top of Container if available from AniList
    if (metadata?.bannerImage) {
      const gallery = new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(metadata.bannerImage)
          .setDescription(episode.animeTitle)
      );
      container.addMediaGalleryComponents(gallery);
    }

    const titleText = `## 🎬 [MỚI] [${episode.animeTitle}](${episode.animeUrl})\n🎉 **${episode.episodeName}** vừa được cập nhật trên **AnimeVietsub**!`;
    const coverUrl = metadata?.coverImage || episode.posterUrl;

    // 2. Header with Thumbnail Accessory if cover image exists
    if (coverUrl) {
      const headerSection = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(coverUrl).setDescription(episode.animeTitle)
        );
      container.addSectionComponents(headerSection);
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // 3. Metadata Section
    const detailsText = new TextDisplayBuilder().setContent(
      `> *${descriptionSnippet}*\n\n` +
        `${studioDisplay}\n` +
        `🏷️ **Thể loại:** ${genresDisplay}\n` +
        `📊 **Đánh giá:** ${scoreDisplay}\n` +
        `🕒 **Cập nhật:** Vừa xong`
    );

    container.addTextDisplayComponents(detailsText);

    // 4. Interactive Action Buttons
    const actionButtons: ButtonBuilder[] = [
      new ButtonBuilder()
        .setLabel(`▶️ Xem ${episode.episodeName}`)
        .setStyle(ButtonStyle.Link)
        .setURL(episode.episodeUrl),
      new ButtonBuilder()
        .setLabel("ℹ️ Chi Tiết Phim")
        .setStyle(ButtonStyle.Link)
        .setURL(episode.animeUrl),
    ];

    if (metadata?.siteUrl) {
      actionButtons.push(
        new ButtonBuilder()
          .setLabel("🌐 AniList")
          .setStyle(ButtonStyle.Link)
          .setURL(metadata.siteUrl)
      );
    }

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(actionButtons);
    container.addActionRowComponents(actionRow);

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2 as any,
    };
  }

  /**
   * Builds Discord Component V2 containers for /anime-latest command (up to 5 anime).
   */
  public static buildAnimeLatestCards(
    items: Array<{ episode: AnimeEpisodeItem; metadata: AniListMetadata | null }>
  ) {
    if (items.length === 0) {
      const emptyContainer = new ContainerBuilder()
        .setAccentColor(0x4dba87)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## 🎬 Anime Mới Cập Nhật - AnimeVietsub\nHiện không có anime mới nào được tìm thấy."
          )
        );
      return {
        components: [emptyContainer],
        flags: MessageFlags.IsComponentsV2 as any,
      };
    }

    const containers: ContainerBuilder[] = items.slice(0, 5).map(({ episode, metadata }, idx) => {
      const accentColor = parseHexColor(metadata?.color);
      const container = new ContainerBuilder().setAccentColor(accentColor);

      const descriptionSnippet = metadata?.description
        ? metadata.description.length > 180
          ? metadata.description.substring(0, 177) + "..."
          : metadata.description
        : "Chưa có tóm tắt.";

      const genresDisplay =
        metadata?.genres && metadata.genres.length > 0
          ? metadata.genres.slice(0, 4).map((g) => `\`${g}\``).join(" ")
          : "`Anime`";

      const scoreDisplay = metadata?.averageScore ? `⭐ ${metadata.averageScore}/100` : "";

      // 1. Panoramic Wide Banner
      if (metadata?.bannerImage) {
        const gallery = new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(metadata.bannerImage)
            .setDescription(episode.animeTitle)
        );
        container.addMediaGalleryComponents(gallery);
      }

      // 2. Header with Thumbnail
      const animeHeader = `### ${idx + 1}. [${episode.animeTitle}](${episode.animeUrl})\n🎉 **${episode.episodeName}** vừa phát hành!`;
      const coverUrl = metadata?.coverImage || episode.posterUrl;

      if (coverUrl) {
        const section = new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(animeHeader))
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(coverUrl).setDescription(episode.animeTitle)
          );
        container.addSectionComponents(section);
      } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(animeHeader));
      }

      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

      // 3. Details
      const studioText = metadata?.studio ? ` • 🏢 ${metadata.studio}` : "";
      const details = new TextDisplayBuilder().setContent(
        `> *${descriptionSnippet}*\n\n` +
          `🏷️ **Thể loại:** ${genresDisplay}${studioText} ${scoreDisplay ? `• ${scoreDisplay}` : ""}`
      );
      container.addTextDisplayComponents(details);

      // 4. Action Buttons
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel(`▶️ Xem ${episode.episodeName}`)
          .setStyle(ButtonStyle.Link)
          .setURL(episode.episodeUrl),
        new ButtonBuilder()
          .setLabel("ℹ️ Chi Tiết Phim")
          .setStyle(ButtonStyle.Link)
          .setURL(episode.animeUrl)
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
   * Builds Component V2 search results for anime.
   */
  public static buildAnimeSearchResults(query: string, results: AnimeSearchResult[]) {
    const container = new ContainerBuilder().setAccentColor(0x4dba87);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## 🔍 Kết Quả Tìm Kiếm Anime: "${query}"`)
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (results.length === 0) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("Không tìm thấy anime nào khớp với từ khóa.")
      );
    } else {
      const listContent = results
        .slice(0, 10)
        .map((r, i) => {
          const epText = r.latestEpisode ? ` • **${r.latestEpisode}**` : "";
          const statusText = r.status ? ` • *${r.status}*` : "";
          return `**${i + 1}. [${r.title}](${r.animeUrl})**${epText}${statusText}`;
        })
        .join("\n\n");

      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(listContent));
    }

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2 as any,
    };
  }
}

