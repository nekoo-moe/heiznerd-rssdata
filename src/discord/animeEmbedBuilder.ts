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
import { AnimeDetailData, AnimeEpisodeItem, AnimeSearchResult, AniListMetadata } from "../anime/types";

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
    metadata: AniListMetadata | null,
    detail?: AnimeDetailData | null
  ) {
    const accentColor = parseHexColor(metadata?.color);
    const container = new ContainerBuilder().setAccentColor(accentColor);

    // 1. Panoramic Wide Banner: prefer official AniList bannerImage, fallback to AnimeVietsub detail.bannerUrl
    const bannerUrl = metadata?.bannerImage || detail?.bannerUrl;
    if (bannerUrl) {
      const gallery = new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(bannerUrl)
          .setDescription(episode.animeTitle)
      );
      container.addMediaGalleryComponents(gallery);
    }

    const titleText = `## 🎬 [MỚI] [${episode.animeTitle}](${episode.animeUrl})\n🎉 **${episode.episodeName}** vừa được cập nhật trên **AnimeVietsub**!`;
    // 2. Poster Cover: prefer detail.posterUrl, then episode.posterUrl, then AniList cover
    const coverUrl = detail?.posterUrl || episode.posterUrl || metadata?.coverImage;

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

    // 3. Description: prefer authentic Vietnamese synopsis from AnimeVietsub
    const rawDesc = detail?.description || metadata?.description || "Chưa có tóm tắt cho bộ anime này.";
    const descriptionSnippet =
      rawDesc.length > 300
        ? rawDesc.substring(0, 297) + "..."
        : rawDesc;

    // 4. Genres: prefer AnimeVietsub Vietnamese/English genres
    const genresList =
      detail?.genres && detail.genres.length > 0
        ? detail.genres
        : metadata?.genres && metadata.genres.length > 0
        ? metadata.genres
        : ["Anime"];
    const genresDisplay = genresList.slice(0, 6).map((g) => `\`${g}\``).join(" ");

    // 5. Rating: prefer AnimeVietsub rating
    const scoreDisplay =
      detail?.rating
        ? `⭐ **${(detail.rating / 10).toFixed(1)}**/10 (${detail.rating}/100)`
        : metadata?.averageScore
        ? `⭐ **${metadata.averageScore}**/100`
        : "⭐ Đang cập nhật";

    const studioDisplay = metadata?.studio ? `🏢 **Studio:** ${metadata.studio}\n` : "";

    const extraMeta = [];
    if (detail?.year) extraMeta.push(`📅 **Năm:** ${detail.year}`);
    if (detail?.episodeTotal) extraMeta.push(`🎞️ **Số tập:** ${detail.episodeTotal}`);
    if (detail?.views) extraMeta.push(`👁️ **Lượt xem:** ${detail.views}`);
    const extraMetaLine = extraMeta.length > 0 ? `${extraMeta.join(" • ")}\n` : "";

    // 6. Metadata Section
    const detailsText = new TextDisplayBuilder().setContent(
      `> *${descriptionSnippet}*\n\n` +
        studioDisplay +
        extraMetaLine +
        `🏷️ **Thể loại:** ${genresDisplay}\n` +
        `📊 **Đánh giá:** ${scoreDisplay}\n` +
        `🕒 **Cập nhật:** Vừa xong`
    );

    container.addTextDisplayComponents(detailsText);

    // 7. Interactive Action Buttons
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
    items: Array<{
      episode: AnimeEpisodeItem;
      metadata: AniListMetadata | null;
      detail?: AnimeDetailData | null;
    }>
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

    const containers: ContainerBuilder[] = items.slice(0, 5).map(({ episode, metadata, detail }, idx) => {
      const accentColor = parseHexColor(metadata?.color);
      const container = new ContainerBuilder().setAccentColor(accentColor);

      // 1. Panoramic Wide Banner: prefer official AniList bannerImage, fallback to AnimeVietsub detail.bannerUrl
      const bannerUrl = metadata?.bannerImage || detail?.bannerUrl;
      if (bannerUrl) {
        const gallery = new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(bannerUrl)
            .setDescription(episode.animeTitle)
        );
        container.addMediaGalleryComponents(gallery);
      }

      // 2. Header with Thumbnail
      const animeHeader = `### ${idx + 1}. [${episode.animeTitle}](${episode.animeUrl})\n🎉 **${episode.episodeName}** vừa phát hành!`;
      const coverUrl = detail?.posterUrl || episode.posterUrl || metadata?.coverImage;

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

      // 3. Description
      const rawDesc = detail?.description || metadata?.description || "Chưa có tóm tắt.";
      const descriptionSnippet =
        rawDesc.length > 200
          ? rawDesc.substring(0, 197) + "..."
          : rawDesc;

      // 4. Genres
      const genresList =
        detail?.genres && detail.genres.length > 0
          ? detail.genres
          : metadata?.genres && metadata.genres.length > 0
          ? metadata.genres
          : ["Anime"];
      const genresDisplay = genresList.slice(0, 4).map((g) => `\`${g}\``).join(" ");

      // 5. Rating
      const scoreDisplay =
        detail?.rating
          ? `⭐ ${(detail.rating / 10).toFixed(1)}/10`
          : metadata?.averageScore
          ? `⭐ ${metadata.averageScore}/100`
          : "";

      const studioText = metadata?.studio ? ` • 🏢 ${metadata.studio}` : "";
      const details = new TextDisplayBuilder().setContent(
        `> *${descriptionSnippet}*\n\n` +
          `🏷️ **Thể loại:** ${genresDisplay}${studioText} ${scoreDisplay ? `• ${scoreDisplay}` : ""}`
      );
      container.addTextDisplayComponents(details);

      // 6. Action Buttons
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

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(actionButtons);
      container.addActionRowComponents(row);

      return container;
    });

    return {
      components: containers,
      flags: MessageFlags.IsComponentsV2 as any,
    };
  }

  /**
   * Builds Component V2 search results for anime with interactive dropdown selection.
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

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("select_anime_detail")
        .setPlaceholder("🎬 Chọn anime để xem chi tiết phim...")
        .addOptions(
          results.slice(0, 10).map((r) => {
            const val = r.animeUrl || r.url || "";
            const safeVal = val.length > 100 ? (new URL(val).pathname || val.substring(0, 100)) : val;
            const desc = r.latestEpisode
              ? `${r.latestEpisode}${r.status ? ` • ${r.status}` : ""}`
              : "Xem thông tin chi tiết phim";
            return {
              label: (r.title || "Không rõ tên").substring(0, 100),
              value: safeVal,
              description: desc.substring(0, 100),
              emoji: "🎬",
            };
          })
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
   * Builds Component V2 detail card for a selected anime.
   */
  public static buildAnimeDetailCard(
    detail: AnimeDetailData,
    metadata: AniListMetadata | null,
    animeUrl: string
  ) {
    const accentColor = parseHexColor(metadata?.color);
    const container = new ContainerBuilder().setAccentColor(accentColor);

    // 1. Panoramic Wide Banner: AniList bannerImage or detail bannerUrl
    const bannerUrl = metadata?.bannerImage || detail.bannerUrl;
    if (bannerUrl) {
      const gallery = new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(bannerUrl).setDescription(detail.title)
      );
      container.addMediaGalleryComponents(gallery);
    }

    const subTitleText = detail.subTitle ? `\n*${detail.subTitle}*` : "";
    const titleText = `## 🎬 [${detail.title}](${animeUrl})${subTitleText}`;

    // 2. Poster cover
    const coverUrl = detail.posterUrl || metadata?.coverImage;
    if (coverUrl) {
      const headerSection = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(coverUrl).setDescription(detail.title)
        );
      container.addSectionComponents(headerSection);
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // 3. Description
    const rawDesc = detail.description || metadata?.description || "Chưa có tóm tắt cho bộ anime này.";
    const cleanDesc = rawDesc.replace(/<[^>]+>/g, "").trim();
    const descriptionSnippet =
      cleanDesc.length > 350
        ? cleanDesc.substring(0, 347) + "..."
        : cleanDesc;

    // 4. Genres
    const genresList =
      detail.genres && detail.genres.length > 0
        ? detail.genres
        : metadata?.genres && metadata.genres.length > 0
        ? metadata.genres
        : ["Anime"];
    const genresDisplay = genresList.slice(0, 8).map((g) => `\`${g}\``).join(" ");

    // 5. Rating
    const scoreDisplay =
      detail.rating
        ? `⭐ **${(detail.rating / 10).toFixed(1)}**/10 (${detail.rating}/100)`
        : metadata?.averageScore
        ? `⭐ **${metadata.averageScore}**/100`
        : "⭐ Đang cập nhật";

    const studioDisplay = metadata?.studio ? `🏢 **Studio:** ${metadata.studio}\n` : "";

    const metaParts = [];
    if (detail.year) metaParts.push(`📅 **Năm:** ${detail.year}`);
    if (detail.episodeTotal) metaParts.push(`🎞️ **Số tập:** ${detail.episodeTotal}`);
    if (detail.views) metaParts.push(`👁️ **Lượt xem:** ${detail.views}`);
    const metaLine = metaParts.length > 0 ? `${metaParts.join(" • ")}\n` : "";

    const detailsText = new TextDisplayBuilder().setContent(
      `> *${descriptionSnippet}*\n\n` +
        studioDisplay +
        metaLine +
        `🏷️ **Thể loại:** ${genresDisplay}\n` +
        `📊 **Đánh giá:** ${scoreDisplay}`
    );
    container.addTextDisplayComponents(detailsText);

    // 6. Action buttons
    const actionButtons: ButtonBuilder[] = [
      new ButtonBuilder()
        .setLabel("▶️ Xem Phim Trên AnimeVietsub")
        .setStyle(ButtonStyle.Link)
        .setURL(animeUrl),
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
}

