import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { config } from "../config/env";
import { logger } from "../utils/logger";

let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbDir = path.dirname(config.database.path);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbInstance = new Database(config.database.path);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("busy_timeout = 5000");
  dbInstance.pragma("synchronous = NORMAL");

  initSchema(dbInstance);
  logger.info(`Database connected at: ${config.database.path}`);
  return dbInstance;
}

function initSchema(db: Database.Database) {
  // Guild channel settings for notification
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_channels (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'all', -- 'all' | 'following'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Notified chapters history to prevent duplicate alerts
  db.exec(`
    CREATE TABLE IF NOT EXISTS notified_chapters (
      chapter_id INTEGER PRIMARY KEY,
      manga_id INTEGER NOT NULL,
      manga_name TEXT,
      chapter_number TEXT,
      chapter_title TEXT,
      notified_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Key-value store for session cache (token, last_check)
  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Guild anime channel settings for anime notifications (Requirement R3)
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_anime_channels (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_guild_anime_channels_channel ON guild_anime_channels (channel_id);
  `);

  // Notified anime episodes history to prevent duplicate alerts (Requirement R3)
  db.exec(`
    CREATE TABLE IF NOT EXISTS notified_episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anime_title TEXT NOT NULL,
      episode_name TEXT,
      episode_url TEXT NOT NULL UNIQUE,
      anime_url TEXT,
      notified_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notified_episodes_url ON notified_episodes (episode_url);
    CREATE INDEX IF NOT EXISTS idx_notified_episodes_notified_at ON notified_episodes (notified_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notified_episodes_anime_url ON notified_episodes (anime_url);
  `);

  // Guild Light Novel channel settings (Hako)
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_ln_channels (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_guild_ln_channels_channel ON guild_ln_channels (channel_id);
  `);

  // Notified Light Novel chapters history (Hako)
  db.exec(`
    CREATE TABLE IF NOT EXISTS notified_ln_chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_title TEXT NOT NULL,
      volume_title TEXT,
      chapter_title TEXT,
      chapter_url TEXT NOT NULL UNIQUE,
      series_url TEXT,
      notified_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notified_ln_chapters_url ON notified_ln_chapters (chapter_url);
    CREATE INDEX IF NOT EXISTS idx_notified_ln_chapters_notified_at ON notified_ln_chapters (notified_at DESC);
  `);

  // Guild Manhwa channel settings (TruyenQQ)
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_manhwa_channels (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_guild_manhwa_channels_channel ON guild_manhwa_channels (channel_id);
  `);

  // Notified Manhwa chapters history (TruyenQQ)
  db.exec(`
    CREATE TABLE IF NOT EXISTS notified_manhwa_chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manhwa_title TEXT NOT NULL,
      chapter_title TEXT,
      chapter_url TEXT NOT NULL UNIQUE,
      manhwa_url TEXT,
      notified_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notified_manhwa_chapters_url ON notified_manhwa_chapters (chapter_url);
    CREATE INDEX IF NOT EXISTS idx_notified_manhwa_chapters_notified_at ON notified_manhwa_chapters (notified_at DESC);
  `);
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}


