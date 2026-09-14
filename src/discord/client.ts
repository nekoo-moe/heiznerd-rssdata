import {
  Client,
  Events,
  GatewayIntentBits,
  Interaction,
} from "discord.js";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { commandMap } from "./commands";
import { deployCommands } from "./deployCommands";

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
  if (!interaction.isChatInputCommand()) return;

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

