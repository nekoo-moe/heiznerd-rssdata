import dotenv from "dotenv";
import path from "path";

dotenv.config();

export interface AppConfig {
  discord: {
    token: string;
    clientId: string;
  };
  cuutruyen: {
    baseUrl: string;
    username: string;
    password: string;
    pollIntervalSeconds: number;
    crawlerMode: "api" | "playwright" | "hybrid";
  };
  database: {
    path: string;
  };
}

export const config: AppConfig = {
  discord: {
    token: process.env.DISCORD_TOKEN || "",
    clientId: process.env.DISCORD_CLIENT_ID || "",
  },
  cuutruyen: {
    baseUrl: process.env.CUUTRUYEN_BASE_URL || "https://cuutruyen.net",
    username: process.env.CUUTRUYEN_USERNAME || "hwuysuywa",
    password: process.env.CUUTRUYEN_PASSWORD || "Nguynqi48@",
    pollIntervalSeconds: Math.max(
      15,
      parseInt(process.env.POLL_INTERVAL_SECONDS || "45", 10)
    ),
    crawlerMode: (process.env.CRAWLER_MODE as any) || "hybrid",
  },
  database: {
    path: process.env.DATABASE_PATH || path.resolve(process.cwd(), "data", "bot.sqlite"),
  },
};

