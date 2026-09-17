/**
 * src/ln/types.ts
 * TypeScript type definitions for Light Novel (Hako / Docln) subsystem.
 */

export interface LnChapterItem {
  seriesTitle: string;
  volumeTitle?: string;
  chapterTitle: string;
  chapterUrl: string;
  seriesUrl: string;
  coverUrl?: string;
  updatedAt?: string;
}

export interface LnDetailData {
  title: string;
  coverUrl?: string;
  author?: string;
  illustrator?: string;
  translator?: string;
  description?: string;
  genres: string[];
  rating?: string;
  views?: string;
  wordCount?: string;
  status?: string;
  seriesUrl: string;
}

export interface LnSearchResult {
  title: string;
  seriesUrl: string;
  coverUrl?: string;
  latestChapter?: string;
}

export interface LnCrawlerStats {
  isRunning: boolean;
  lastPollAt: string | null;
  totalPolled: number;
  totalDispatched: number;
  lastError: string | null;
}

