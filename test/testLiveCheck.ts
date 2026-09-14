import { Client, GatewayIntentBits } from "discord.js";
import { config } from "../src/config/env";
import { crawlerManager } from "../src/crawler/crawlerManager";
import { logger } from "../src/utils/logger";

async function runLiveCheck() {
  logger.info("Testing live check and Discord notification dispatch...");
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  client.once("ready", async (c) => {
    logger.success(`Logged into Discord as ${c.user.tag}`);
    crawlerManager.setDiscordClient(client);

    // Run check updates
    const result = await crawlerManager.checkUpdates(false);
    logger.success(
      `CheckUpdates finished: scanned ${result.checkedCount}, new chapters: ${result.newChaptersCount}`
    );

    // Wait 5 seconds for queue to finish sending
    setTimeout(() => {
      client.destroy();
      process.exit(0);
    }, 5000);
  });

  await client.login(config.discord.token);
}

runLiveCheck().catch((err) => {
  logger.error("Live check test error:", err);
  process.exit(1);
});

