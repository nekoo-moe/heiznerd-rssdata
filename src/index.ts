import { config } from "./config/env";
import { crawlerManager } from "./crawler/crawlerManager";
import { cuutruyenClient } from "./crawler/cuutruyenClient";
import { playwrightCrawler } from "./crawler/playwrightCrawler";
import { getDatabase } from "./database/db";
import { discordClient, startDiscordBot } from "./discord/client";
import { logger } from "./utils/logger";

async function bootstrap() {
  console.log("==================================================");
  console.log("   CUUTRUYEN MANGA DISCORD BOT & CRAWLER         ");
  console.log("==================================================");

  // 1. Initialize SQLite Database
  logger.info("Initializing SQLite database...");
  getDatabase();

  // 2. Initialize Cuutruyen Client & Verify Auth
  logger.info("Authenticating with Cuutruyen.net...");
  const loggedIn = await cuutruyenClient.login();
  if (loggedIn) {
    logger.success("Cuutruyen authentication ready.");
  } else {
    logger.warn(
      "Could not authenticate with Cuutruyen. Running in public/guest mode."
    );
  }

  // 3. Connect Discord Bot
  if (config.discord.token) {
    try {
      await startDiscordBot();
      crawlerManager.setDiscordClient(discordClient);
    } catch (e) {
      logger.error("Could not connect Discord bot:", e);
    }
  } else {
    logger.warn(
      "No DISCORD_TOKEN provided in .env. Bot is running in CRAWLER-ONLY mode."
    );
  }

  // 4. Start Background Crawler
  await crawlerManager.start();

  logger.success("System fully initialized and running!");
}

async function shutdown() {
  logger.info("Gracefully shutting down...");
  crawlerManager.stop();
  await playwrightCrawler.close();
  discordClient.destroy();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

bootstrap().catch((error) => {
  logger.error("Fatal error during bootstrap:", error);
  process.exit(1);
});

