import { getDatabase } from "../db";

export interface GuildLnChannelSetting {
  guild_id: string;
  channel_id: string;
  created_at?: string;
  updated_at?: string;
}

export class GuildLnRepository {
  static setChannel(guildId: string, channelId: string): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO guild_ln_channels (guild_id, channel_id, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(guildId, channelId);
  }

  static getChannel(guildId: string): GuildLnChannelSetting | null {
    const db = getDatabase();
    const stmt = db.prepare(
      "SELECT guild_id, channel_id, created_at, updated_at FROM guild_ln_channels WHERE guild_id = ?"
    );
    const row = stmt.get(guildId) as GuildLnChannelSetting | undefined;
    return row || null;
  }

  static getByGuildId(guildId: string): GuildLnChannelSetting | null {
    return this.getChannel(guildId);
  }

  static getAllChannels(): GuildLnChannelSetting[] {
    const db = getDatabase();
    const stmt = db.prepare(
      "SELECT guild_id, channel_id, created_at, updated_at FROM guild_ln_channels"
    );
    return stmt.all() as GuildLnChannelSetting[];
  }

  static getAll(): GuildLnChannelSetting[] {
    return this.getAllChannels();
  }

  static removeChannel(guildId: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare("DELETE FROM guild_ln_channels WHERE guild_id = ?");
    const res = stmt.run(guildId);
    return res.changes > 0;
  }

  static count(): number {
    const db = getDatabase();
    const stmt = db.prepare("SELECT COUNT(*) as cnt FROM guild_ln_channels");
    const res = stmt.get() as { cnt: number };
    return res.cnt;
  }
}

