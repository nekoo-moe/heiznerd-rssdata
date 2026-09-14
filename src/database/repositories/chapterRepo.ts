import { getDatabase } from "../db";

export interface NotifiedChapterRecord {
  chapter_id: number;
  manga_id: number;
  manga_name: string;
  chapter_number: string;
  chapter_title: string;
  notified_at?: string;
}

export class ChapterRepository {
  static isNotified(chapterId: number): boolean {
    const db = getDatabase();
    const stmt = db.prepare("SELECT 1 FROM notified_chapters WHERE chapter_id = ?");
    const row = stmt.get(chapterId);
    return !!row;
  }

  static markNotified(
    chapterId: number,
    mangaId: number,
    mangaName: string,
    chapterNumber: string,
    chapterTitle: string
  ): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO notified_chapters (chapter_id, manga_id, manga_name, chapter_number, chapter_title)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(chapterId, mangaId, mangaName, chapterNumber, chapterTitle);
  }

  static count(): number {
    const db = getDatabase();
    const stmt = db.prepare("SELECT COUNT(*) as cnt FROM notified_chapters");
    const res = stmt.get() as { cnt: number };
    return res.cnt;
  }

  static getRecent(limit: number = 10): NotifiedChapterRecord[] {
    const db = getDatabase();
    const stmt = db.prepare("SELECT * FROM notified_chapters ORDER BY notified_at DESC LIMIT ?");
    return stmt.all(limit) as NotifiedChapterRecord[];
  }
}

