import { REST, Routes } from "discord.js";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { commands } from "./commands";

export async function deployCommands(): Promise<void> {
  const { token, clientId } = config.discord;

  if (!token || !clientId) {
    logger.error("Cannot deploy commands: DISCORD_TOKEN or DISCORD_CLIENT_ID is missing.");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);
  const commandData = commands.map((c) => c.data.toJSON());

  try {
    // First, purge any guild-specific commands to eliminate duplicates with global commands
    try {
      const guilds = (await rest.get(Routes.userGuilds())) as any[];
      for (const guild of guilds) {
        await rest.put(Routes.applicationGuildCommands(clientId, guild.id), {
          body: [],
        });
        logger.discord(`Cleaned up duplicate guild commands in "${guild.name}" (${guild.id})`);
      }
    } catch (gErr) {
      logger.warn("Could not clean guild-specific commands:", gErr);
    }

    logger.discord(`Deploying ${commandData.length} application (/) commands to Discord (globally)...`);
    await rest.put(Routes.applicationCommands(clientId), {
      body: commandData,
    });
    logger.success(`Successfully deployed ${commandData.length} application (/) commands globally!`);
  } catch (error) {
    logger.error("Failed to deploy commands:", error);
  }
}

// If executed directly from command line
if (require.main === module) {
  deployCommands().then(() => process.exit(0));
}

