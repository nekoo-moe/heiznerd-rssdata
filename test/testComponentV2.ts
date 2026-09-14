import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { EnrichedChapterNotification } from "../src/crawler/types";
import { logger } from "../src/utils/logger";

export function buildComponentV2Message(data: EnrichedChapterNotification) {
  const accentColor = data.dominantColor?.startsWith("#")
    ? parseInt(data.dominantColor.replace("#", ""), 16)
    : 0x4dba87;

  const container = new ContainerBuilder().setAccentColor(accentColor);

  const chapterDate = new Date(data.chapterCreatedAt);
  const unixTimestamp = Math.floor(chapterDate.getTime() / 1000);
  const timeDisplay = isNaN(unixTimestamp)
    ? "Vừa xong"
    : `<t:${unixTimestamp}:R>`;

  const chapterTitleText = data.chapterTitle ? `: ${data.chapterTitle}` : "";

  // 1. Header Section with Title and Cover Thumbnail accessory
  const headerSection = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 🔔 [MỚI] [${data.mangaTitle}](${data.mangaUrl})\n🎉 **Chapter ${data.chapterNumber}${chapterTitleText}** vừa được cập nhật trên **Cứu Truyện**!`
    )
  );

  if (data.coverUrl) {
    headerSection.setThumbnailAccessory(
      new ThumbnailBuilder().setURL(data.coverUrl)
    );
  }

  container.addSectionComponents(headerSection);
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  // 2. Metadata Section (Description quote, Author, Team, Tags, Time)
  const tagsStr =
    data.tags && data.tags.length > 0
      ? data.tags.slice(0, 8).map((t) => `\`${t}\``).join(" ")
      : "Không có";

  const descriptionSnippet = data.description
    ? data.description.length > 250
      ? data.description.substring(0, 247) + "..."
      : data.description
    : "Chưa có tóm tắt cho bộ truyện này.";

  const detailsText = new TextDisplayBuilder().setContent(
    `> *${descriptionSnippet}*\n\n` +
      `👤 **Tác giả:** ${data.authorName || "Đang cập nhật"}\n` +
      `👥 **Nhóm dịch:** ${data.teamName || "Cứu Truyện"}\n` +
      `🏷️ **Thể loại:** ${tagsStr}\n` +
      `🕒 **Cập nhật:** ${timeDisplay}`
  );

  container.addTextDisplayComponents(detailsText);

  // 3. Action Buttons
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
    flags: MessageFlags.IsComponentsV2,
  };
}

async function run() {
  logger.info("Testing Component V2 builder...");
  const mockData: EnrichedChapterNotification = {
    chapterId: 96021,
    chapterNumber: "125",
    chapterTitle: "Gặp lại",
    chapterCreatedAt: new Date().toISOString(),
    chapterUrl: "https://cuutruyen.net/mangas/2640/chapters/96021",
    mangaId: 2640,
    mangaTitle: "Ri-chan",
    mangaUrl: "https://cuutruyen.net/mangas/2640",
    coverUrl:
      "https://storage-bravo.cuutruyen.net/file/cuutruyen/uploads/manga/2640/cover/processed-57b7f969471fe890586959381101cb9e.jpg",
    authorName: "Yamamoto Koudai",
    teamName: "tự nhiên nhóm này lại tồn tại",
    tags: ["comedy", "romance", "drama"],
    description: "Tatsu vì lý do công việc nên đã quay về nhà ba mẹ...",
    dominantColor: "#ee3624",
  };

  const payload = buildComponentV2Message(mockData);
  console.log("Payload flags:", payload.flags);
  console.log(
    "Container components count:",
    (payload.components[0] as ContainerBuilder).toJSON().components.length
  );
  logger.success("Component V2 payload built successfully!");
}

run();

