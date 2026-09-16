import { getDatabase } from "../db";

export interface NotifiedEpisodeRecord {
  id?: number;
  anime_title: string;
  episode_name: string;
  episode_url: string;
  anime_url: string;
  notified_at?: string;
}

export interface AnimeEpisodeInput {
  anime_title?: string;
  animeTitle?: string;
  episode_name?: string;
  episodeName?: string;
  episode_url?: string;
  episodeUrl?: string;
  anime_url?: string;
  animeUrl?: string;
}

export type AnimeEpisodeItem = AnimeEpisodeInput & {
  posterUrl?: string;
  updatedAt?: string;
};

export class AnimeEpisodeRepository {
  /**
   * Check whether an episode has already been notified.
   * Accelerated by idx_notified_episodes_url unique index.
   */
  static isNotified(episodeUrl: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare("SELECT 1 FROM notified_episodes WHERE episode_url = ?");
    const row = stmt.get(episodeUrl);
    return !!row;
  }

  /**
   * Mark an episode as notified in the database.
   * Supports both snake_case and camelCase input objects.
   */
  static markNotified(item: AnimeEpisodeInput): void {
    const epUrl = item.episode_url ?? item.episodeUrl ?? "";
    if (!epUrl) return;

    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO notified_episodes (anime_title, episode_name, episode_url, anime_url, notified_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const title = item.anime_title ?? item.animeTitle ?? "";
    const name = item.episode_name ?? item.episodeName ?? "";
    const animeUrl = item.anime_url ?? item.animeUrl ?? "";

    stmt.run(title, name, epUrl, animeUrl);
  }

  /**
   * Seed a batch of initial episodes into the database on first boot without alerting.
   * Uses a single atomic SQLite transaction for high throughput and consistency.
   */
  static seedInitial(episodes: AnimeEpisodeInput[]): void {
    if (!episodes || episodes.length === 0) return;

    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO notified_episodes (anime_title, episode_name, episode_url, anime_url, notified_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const insertMany = db.transaction((items: AnimeEpisodeInput[]) => {
      for (const ep of items) {
        const epUrl = ep.episode_url ?? ep.episodeUrl ?? "";
        if (epUrl) {
          const title = ep.anime_title ?? ep.animeTitle ?? "";
          const name = ep.episode_name ?? ep.episodeName ?? "";
          const animeUrl = ep.anime_url ?? ep.animeUrl ?? "";
          stmt.run(title, name, epUrl, animeUrl);
        }
      }
    });

    insertMany(episodes);
  }

  /**
   * Retrieve the most recently notified episodes ordered newest first.
   */
  static getRecentNotified(limit: number = 10): NotifiedEpisodeRecord[] {
    const db = getDatabase();
    const stmt = db.prepare(
      "SELECT id, anime_title, episode_name, episode_url, anime_url, notified_at FROM notified_episodes ORDER BY notified_at DESC, id DESC LIMIT ?"
    );
    return stmt.all(limit) as NotifiedEpisodeRecord[];
  }

  /**
   * Alias for getRecentNotified to maintain parity with ChapterRepository.getRecent.
   */
  static getRecent(limit: number = 10): NotifiedEpisodeRecord[] {
    return this.getRecentNotified(limit);
  }

  /**
   * Total count of notified episodes. Used for initial seeding check on startup.
   */
  static count(): number {
    const db = getDatabase();
    const stmt = db.prepare("SELECT COUNT(*) as cnt FROM notified_episodes");
    const res = stmt.get() as { cnt: number };
    return res.cnt;
  }

  /**
   * Delete an episode by URL. Useful for testing and rollback.
   */
  static deleteByUrl(episodeUrl: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare("DELETE FROM notified_episodes WHERE episode_url = ?");
    const res = stmt.run(episodeUrl);
    return res.changes > 0;
  }
}
