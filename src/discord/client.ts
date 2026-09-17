import {
  Client,
  Events,
  GatewayIntentBits,
  Interaction,
} from "discord.js";
import { anilistService, animevietsubScraper } from "../anime";
import { config } from "../config/env";
import { cuutruyenClient } from "../crawler/cuutruyenClient";
import { logger } from "../utils/logger";
import { DiscordAnimeEmbedBuilder } from "./animeEmbedBuilder";
import { commandMap } from "./commands";
import { deployCommands } from "./deployCommands";
import { DiscordEmbedBuilder } from "./embedBuilder";

export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

discordClient.once(Events.ClientReady, async (c) => {
  logger.success(`Discord Bot logged in as ${c.user.tag} (ID: ${c.user.id})`);

  // Optionally auto-deploy slash commands on boot if client ID is set
  if (config.discord.clientId && config.discord.token) {
    try {
      await deployCommands();
    } catch (e) {
      logger.warn("Auto deploy commands failed on boot:", e);
    }
  }
});

discordClient.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = commandMap.get(interaction.commandName);
    if (!command) {
      logger.warn(`Unknown command executed: /${interaction.commandName}`);
      return;
    }

    try {
      logger.discord(
        `User ${interaction.user.tag} executed /${interaction.commandName} in #${(interaction.channel as any)?.name || interaction.channelId}`
      );
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Error executing /${interaction.commandName}:`, error);
      const replyContent = {
        content: "❌ Đã có lỗi xảy ra khi thực thi lệnh này. Vui lòng thử lại sau!",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyContent);
      } else {
        await interaction.reply(replyContent);
      }
    }
    return;
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "select_manga_detail") {
      try {
        await interaction.deferReply({ ephemeral: true });
        const mangaId = parseInt(interaction.values[0], 10);
        if (isNaN(mangaId)) {
          await interaction.editReply({ content: "❌ ID truyện không hợp lệ." });
          return;
        }

        const mangaDetail = await cuutruyenClient.getMangaDetail(mangaId);
        if (!mangaDetail) {
          await interaction.editReply({
            content: "❌ Không thể tải thông tin chi tiết của bộ truyện này từ Cuutruyen.",
          });
          return;
        }

        const payload = DiscordEmbedBuilder.buildMangaDetailCard(mangaDetail);
        await interaction.editReply(payload as any);
      } catch (error) {
        logger.error("Error displaying manga detail card:", error);
        await interaction.editReply({
          content: "❌ Đã có lỗi xảy ra khi tải chi tiết truyện tranh.",
        });
      }
      return;
    }

    if (interaction.customId === "select_anime_detail") {
      try {
        await interaction.deferReply({ ephemeral: true });
        let animeUrl = interaction.values[0];
        if (!animeUrl) {
          await interaction.editReply({ content: "❌ URL anime không hợp lệ." });
          return;
        }

        if (!animeUrl.startsWith("http")) {
          const activeDomain =
            (animevietsubScraper as any).domainResolver?.getActiveDomain?.() ||
            "https://animevietsub.zip";
          animeUrl = new URL(animeUrl, activeDomain).href;
        }

        const detail = await animevietsubScraper.getAnimeDetails(animeUrl);
        if (!detail) {
          await interaction.editReply({
            content: "❌ Không thể tải thông tin chi tiết của bộ anime này từ AnimeVietsub.",
          });
          return;
        }

        const extraCandidates = detail.subTitle
          ? detail.subTitle.split(/[,;]/).map((s) => s.trim())
          : undefined;

        const metadata = await Promise.race([
          anilistService.enrich(detail.title, animeUrl, extraCandidates),
          new Promise<null>((r) => setTimeout(() => r(null), 3500)),
        ]).catch(() => null);

        const payload = DiscordAnimeEmbedBuilder.buildAnimeDetailCard(detail, metadata, animeUrl);
        await interaction.editReply(payload as any);
      } catch (error) {
        logger.error("Error displaying anime detail card:", error);
        await interaction.editReply({
          content: "❌ Đã có lỗi xảy ra khi tải chi tiết anime.",
        });
      }
      return;
    }
  }
});

export async function startDiscordBot(): Promise<Client> {
  const { token } = config.discord;
  if (!token) {
    logger.warn(
      "DISCORD_TOKEN is not set in .env! Discord Bot features will be disabled until token is configured."
    );
    return discordClient;
  }

  try {
    logger.discord("Connecting to Discord Gateway...");
    await discordClient.login(token);
    return discordClient;
  } catch (error) {
    logger.error("Failed to login to Discord:", error);
    throw error;
  }
}

