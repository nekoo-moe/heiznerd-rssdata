export interface CuutruyenTag {
  name: string;
  slug: string;
  tagging_count?: number;
}

export interface CuutruyenTeam {
  id: number;
  name: string;
  slug?: string;
  description?: string | null;
  facebook_address?: string | null;
  is_ads?: boolean;
  translations_count?: number;
  mangas_count?: number;
}

export interface CuutruyenAuthor {
  name: string;
}

export interface CuutruyenTitle {
  id: number;
  name: string;
  primary: boolean;
}

export interface MangaListItem {
  id: number;
  name: string;
  cover_url: string;
  cover_mobile_url: string;
  newest_chapter_number: string;
  newest_chapter_id: number;
  newest_chapter_created_at: string;
}

export interface MangaDetail {
  id: number;
  name: string;
  cover_url: string;
  cover_mobile_url: string;
  panorama_url?: string;
  panorama_mobile_url?: string;
  panorama_dominant_color?: string;
  panorama_dominant_color_2?: string;
  newest_chapter_number?: string;
  newest_chapter_id?: number;
  newest_chapter_created_at?: string;
  author?: CuutruyenAuthor | null;
  description?: string;
  full_description?: string | null;
  official_url?: string;
  chapters_count?: number;
  views_count?: number;
  is_nsfw?: boolean;
  tags?: CuutruyenTag[];
  team?: CuutruyenTeam | null;
  titles?: CuutruyenTitle[];
  created_at?: string;
  updated_at?: string;
}

export interface ChapterDetail {
  id: number;
  order: number;
  number: string;
  name: string;
  views_count?: number;
  comments_count?: number;
  status?: string;
  previous_chapter_id?: number | null;
  previous_chapter_number?: string | null;
  previous_chapter_name?: string | null;
  next_chapter_id?: number | null;
  next_chapter_number?: string | null;
  next_chapter_name?: string | null;
  created_at: string;
  updated_at?: string;
  manga: {
    id: number;
    name: string;
    description?: string;
    cover_url: string;
    cover_mobile_url: string;
    panorama_url?: string;
    panorama_mobile_url?: string;
    is_nsfw?: boolean;
  };
  team?: CuutruyenTeam | null;
}

export interface UserAuthResponse {
  data: {
    id: number;
    username: string;
    email: string;
    level: string;
    teams: any[];
    created_at: string;
  };
  version: number;
  auth_token: string;
}

export interface EnrichedChapterNotification {
  chapterId: number;
  chapterNumber: string;
  chapterTitle: string;
  chapterCreatedAt: string;
  chapterUrl: string;
  mangaId: number;
  mangaTitle: string;
  mangaUrl: string;
  coverUrl: string;
  authorName: string;
  teamName: string;
  teamFacebook?: string | null;
  tags: string[];
  description: string;
  viewsCount?: number;
  dominantColor?: string;
  isNsfw?: boolean;
  panoramaUrl?: string | null;
}

