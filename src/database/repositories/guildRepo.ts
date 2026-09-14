import { getDatabase } from "../db";

export interface GuildChannelSetting {
  guild_id: string;
  channel_id: string;
  mode: "all" | "following";
  created_at?: string;
  updated_at?: string;
}

export class GuildRepository {
  static setChannel(guildId: string, channelId: string, mode: "all" | "following" = "all"): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO guild_channels (guild_id, channel_id, mode, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        mode = excluded.mode,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(guildId, channelId, mode);
  }

  static getByGuildId(guildId: string): GuildChannelSetting | null {
    const db = getDatabase();
    const stmt = db.prepare("SELECT * FROM guild_channels WHERE guild_id = ?");
    const row = stmt.get(guildId) as GuildChannelSetting | undefined;
    return row || null;
  }

  static getAll(): GuildChannelSetting[] {
    const db = getDatabase();
    const stmt = db.prepare("SELECT * FROM guild_channels");
    return stmt.all() as GuildChannelSetting[];
  }

  static removeChannel(guildId: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare("DELETE FROM guild_channels WHERE guild_id = ?");
    const res = stmt.run(guildId);
    return res.changes > 0;
  }

  static count(): number {
    const db = getDatabase();
    const stmt = db.prepare("SELECT COUNT(*) as cnt FROM guild_channels");
    const res = stmt.get() as { cnt: number };
    return res.cnt;
  }
}

