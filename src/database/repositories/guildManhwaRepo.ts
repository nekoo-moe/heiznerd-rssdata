import { getDatabase } from "../db";

export interface GuildManhwaChannelSetting {
  guild_id: string;
  channel_id: string;
  created_at?: string;
  updated_at?: string;
}

export class GuildManhwaRepository {
  static setChannel(guildId: string, channelId: string): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO guild_manhwa_channels (guild_id, channel_id, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(guildId, channelId);
  }

  static getChannel(guildId: string): GuildManhwaChannelSetting | null {
    const db = getDatabase();
    const stmt = db.prepare(
      "SELECT guild_id, channel_id, created_at, updated_at FROM guild_manhwa_channels WHERE guild_id = ?"
    );
    const row = stmt.get(guildId) as GuildManhwaChannelSetting | undefined;
    return row || null;
  }

  static getByGuildId(guildId: string): GuildManhwaChannelSetting | null {
    return this.getChannel(guildId);
  }

  static getAllChannels(): GuildManhwaChannelSetting[] {
    const db = getDatabase();
    const stmt = db.prepare(
      "SELECT guild_id, channel_id, created_at, updated_at FROM guild_manhwa_channels"
    );
    return stmt.all() as GuildManhwaChannelSetting[];
  }

  static getAll(): GuildManhwaChannelSetting[] {
    return this.getAllChannels();
  }

  static removeChannel(guildId: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare("DELETE FROM guild_manhwa_channels WHERE guild_id = ?");
    const res = stmt.run(guildId);
    return res.changes > 0;
  }

  static count(): number {
    const db = getDatabase();
    const stmt = db.prepare("SELECT COUNT(*) as cnt FROM guild_manhwa_channels");
    const res = stmt.get() as { cnt: number };
    return res.cnt;
  }
}

