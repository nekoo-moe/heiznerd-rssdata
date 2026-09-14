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
    logger.discord(`Deploying ${commandData.length} application (/) commands to Discord...`);
    await rest.put(Routes.applicationCommands(clientId), {
      body: commandData,
    });
    logger.success("Successfully deployed application (/) commands globally!");
  } catch (error) {
    logger.error("Failed to deploy commands:", error);
  }
}

// If executed directly from command line
if (require.main === module) {
  deployCommands().then(() => process.exit(0));
}

