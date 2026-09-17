import { getDatabase } from "../db";

export interface NotifiedManhwaChapterRecord {
  id?: number;
  manhwa_title: string;
  chapter_title?: string;
  chapter_url: string;
  manhwa_url?: string;
  notified_at?: string;
}

export interface ManhwaChapterInput {
  manhwa_title?: string;
  manhwaTitle?: string;
  chapter_title?: string;
  chapterTitle?: string;
  chapter_url?: string;
  chapterUrl?: string;
  manhwa_url?: string;
  manhwaUrl?: string;
  cover_url?: string;
  coverUrl?: string;
  other_name?: string;
  otherName?: string;
}

export class ManhwaChapterRepository {
  static isNotified(chapterUrl: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare("SELECT 1 FROM notified_manhwa_chapters WHERE chapter_url = ?");
    const row = stmt.get(chapterUrl);
    return !!row;
  }

  static markNotified(item: ManhwaChapterInput): void {
    const chUrl = item.chapter_url ?? item.chapterUrl ?? "";
    if (!chUrl) return;

    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO notified_manhwa_chapters (manhwa_title, chapter_title, chapter_url, manhwa_url, notified_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const title = item.manhwa_title ?? item.manhwaTitle ?? "";
    const chapterTitle = item.chapter_title ?? item.chapterTitle ?? "";
    const manhwaUrl = item.manhwa_url ?? item.manhwaUrl ?? "";

    stmt.run(title, chapterTitle, chUrl, manhwaUrl);
  }

  static seedInitial(chapters: ManhwaChapterInput[]): void {
    if (!chapters || chapters.length === 0) return;

    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO notified_manhwa_chapters (manhwa_title, chapter_title, chapter_url, manhwa_url, notified_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const insertMany = db.transaction((items: ManhwaChapterInput[]) => {
      for (const ch of items) {
        const chUrl = ch.chapter_url ?? ch.chapterUrl ?? "";
        if (chUrl) {
          const title = ch.manhwa_title ?? ch.manhwaTitle ?? "";
          const chapterTitle = ch.chapter_title ?? ch.chapterTitle ?? "";
          const manhwaUrl = ch.manhwa_url ?? ch.manhwaUrl ?? "";
          stmt.run(title, chapterTitle, chUrl, manhwaUrl);
        }
      }
    });

    insertMany(chapters);
  }

  static getRecentNotified(limit: number = 10): NotifiedManhwaChapterRecord[] {
    const db = getDatabase();
    const stmt = db.prepare(
      "SELECT id, manhwa_title, chapter_title, chapter_url, manhwa_url, notified_at FROM notified_manhwa_chapters ORDER BY notified_at DESC, id DESC LIMIT ?"
    );
    return stmt.all(limit) as NotifiedManhwaChapterRecord[];
  }

  static count(): number {
    const db = getDatabase();
    const stmt = db.prepare("SELECT COUNT(*) as cnt FROM notified_manhwa_chapters");
    const res = stmt.get() as { cnt: number };
    return res.cnt;
  }

  static deleteByUrl(chapterUrl: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare("DELETE FROM notified_manhwa_chapters WHERE chapter_url = ?");
    const res = stmt.run(chapterUrl);
    return res.changes > 0;
  }
}

