import { getDatabase } from "../db";

export interface GuildAnimeChannelSetting {
  guild_id: string;
  channel_id: string;
  created_at?: string;
  updated_at?: string;
}

export class GuildAnimeRepository {
  /**
   * Set or update the anime notification channel for a Discord guild.
   */
  static setChannel(guildId: string, channelId: string): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO guild_anime_channels (guild_id, channel_id, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(guildId, channelId);
  }

  /**
   * Get the configured anime notification channel for a specific guild.
   */
  static getChannel(guildId: string): GuildAnimeChannelSetting | null {
    const db = getDatabase();
    const stmt = db.prepare(
      "SELECT guild_id, channel_id, created_at, updated_at FROM guild_anime_channels WHERE guild_id = ?"
    );
    const row = stmt.get(guildId) as GuildAnimeChannelSetting | undefined;
    return row || null;
  }

  /**
   * Alias for getChannel to maintain naming parity with GuildRepository.getByGuildId.
   */
  static getByGuildId(guildId: string): GuildAnimeChannelSetting | null {
    return this.getChannel(guildId);
  }

  /**
   * Get all registered anime notification channels across all guilds.
   */
  static getAllChannels(): GuildAnimeChannelSetting[] {
    const db = getDatabase();
    const stmt = db.prepare(
      "SELECT guild_id, channel_id, created_at, updated_at FROM guild_anime_channels"
    );
    return stmt.all() as GuildAnimeChannelSetting[];
  }

  /**
   * Alias for getAllChannels to maintain naming parity with GuildRepository.getAll.
   */
  static getAll(): GuildAnimeChannelSetting[] {
    return this.getAllChannels();
  }

  /**
   * Remove the anime notification channel configuration for a guild.
   * Returns true if a record was deleted, false if not found.
   */
  static removeChannel(guildId: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare("DELETE FROM guild_anime_channels WHERE guild_id = ?");
    const res = stmt.run(guildId);
    return res.changes > 0;
  }

  /**
   * Count total guilds configured for anime notifications.
   */
  static count(): number {
    const db = getDatabase();
    const stmt = db.prepare("SELECT COUNT(*) as cnt FROM guild_anime_channels");
    const res = stmt.get() as { cnt: number };
    return res.cnt;
  }
}
