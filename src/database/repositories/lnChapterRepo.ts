import { getDatabase } from "../db";

export interface NotifiedLnChapterRecord {
  id?: number;
  series_title: string;
  volume_title?: string;
  chapter_title?: string;
  chapter_url: string;
  series_url?: string;
  notified_at?: string;
}

export interface LnChapterInput {
  series_title?: string;
  seriesTitle?: string;
  volume_title?: string;
  volumeTitle?: string;
  chapter_title?: string;
  chapterTitle?: string;
  chapter_url?: string;
  chapterUrl?: string;
  series_url?: string;
  seriesUrl?: string;
  cover_url?: string;
  coverUrl?: string;
}

export class LnChapterRepository {
  static isNotified(chapterUrl: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare("SELECT 1 FROM notified_ln_chapters WHERE chapter_url = ?");
    const row = stmt.get(chapterUrl);
    return !!row;
  }

  static markNotified(item: LnChapterInput): void {
    const chUrl = item.chapter_url ?? item.chapterUrl ?? "";
    if (!chUrl) return;

    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO notified_ln_chapters (series_title, volume_title, chapter_title, chapter_url, series_url, notified_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const seriesTitle = item.series_title ?? item.seriesTitle ?? "";
    const volumeTitle = item.volume_title ?? item.volumeTitle ?? "";
    const chapterTitle = item.chapter_title ?? item.chapterTitle ?? "";
    const seriesUrl = item.series_url ?? item.seriesUrl ?? "";

    stmt.run(seriesTitle, volumeTitle, chapterTitle, chUrl, seriesUrl);
  }

  static seedInitial(chapters: LnChapterInput[]): void {
    if (!chapters || chapters.length === 0) return;

    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO notified_ln_chapters (series_title, volume_title, chapter_title, chapter_url, series_url, notified_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const insertMany = db.transaction((items: LnChapterInput[]) => {
      for (const ch of items) {
        const chUrl = ch.chapter_url ?? ch.chapterUrl ?? "";
        if (chUrl) {
          const seriesTitle = ch.series_title ?? ch.seriesTitle ?? "";
          const volumeTitle = ch.volume_title ?? ch.volumeTitle ?? "";
          const chapterTitle = ch.chapter_title ?? ch.chapterTitle ?? "";
          const seriesUrl = ch.series_url ?? ch.seriesUrl ?? "";
          stmt.run(seriesTitle, volumeTitle, chapterTitle, chUrl, seriesUrl);
        }
      }
    });

    insertMany(chapters);
  }

  static getRecentNotified(limit: number = 10): NotifiedLnChapterRecord[] {
    const db = getDatabase();
    const stmt = db.prepare(
      "SELECT id, series_title, volume_title, chapter_title, chapter_url, series_url, notified_at FROM notified_ln_chapters ORDER BY notified_at DESC, id DESC LIMIT ?"
    );
    return stmt.all(limit) as NotifiedLnChapterRecord[];
  }

  static count(): number {
    const db = getDatabase();
    const stmt = db.prepare("SELECT COUNT(*) as cnt FROM notified_ln_chapters");
    const res = stmt.get() as { cnt: number };
    return res.cnt;
  }

  static deleteByUrl(chapterUrl: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare("DELETE FROM notified_ln_chapters WHERE chapter_url = ?");
    const res = stmt.run(chapterUrl);
    return res.changes > 0;
  }
}

