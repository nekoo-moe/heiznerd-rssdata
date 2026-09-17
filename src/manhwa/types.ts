/**
 * src/manhwa/types.ts
 * TypeScript type definitions for Manhwa (TruyenQQ) subsystem.
 */

export interface ManhwaChapterItem {
  manhwaTitle: string;
  otherName?: string;
  chapterTitle: string;
  chapterUrl: string;
  manhwaUrl: string;
  coverUrl?: string;
  updatedAt?: string;
}

export interface ManhwaDetailData {
  title: string;
  otherName?: string;
  coverUrl?: string;
  author?: string;
  status?: string;
  description?: string;
  genres: string[];
  views?: string;
  followers?: string;
  totalChapters?: string;
  manhwaUrl: string;
  latestChapter?: string;
}

export interface ManhwaSearchResult {
  title: string;
  otherName?: string;
  manhwaUrl: string;
  coverUrl?: string;
  latestChapter?: string;
}

export interface ManhwaCrawlerStats {
  isRunning: boolean;
  lastPollAt: string | null;
  totalPolled: number;
  totalDispatched: number;
  lastError: string | null;
  activeDomain?: string;
}

