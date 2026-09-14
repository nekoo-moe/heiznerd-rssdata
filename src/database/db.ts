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
}

