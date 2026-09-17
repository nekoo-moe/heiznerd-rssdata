import { NormalizedTitle } from "./types";

/**
 * Normalizes raw Vietnamese/English anime titles extracted from AnimeVietsub
 * to maximize AniList GraphQL match rate.
 */
export function normalizeAnimeTitle(
  rawTitle: string,
  animeUrl?: string,
  extraCandidates?: string[]
): NormalizedTitle {
  if (!rawTitle || typeof rawTitle !== "string") {
    return { primary: "", candidates: [] };
  }

  let cleaned = rawTitle.trim();

  // Extract year if present, e.g. "(2024)" or "[2023]"
  let year: number | undefined;
  const yearMatch = cleaned.match(/[\(\[]\s*(\d{4})\s*[\)\]]/);
  if (yearMatch) {
    const parsedYear = parseInt(yearMatch[1], 10);
    if (parsedYear >= 1960 && parsedYear <= 2035) {
      year = parsedYear;
    }
  }

  // Extract season/part if present, e.g. "Phần 2", "Season 3", "Part 1", "Mùa 2"
  let season: number | undefined;
  const seasonMatch = cleaned.match(/(?:Phần|Mùa|Season|Part)\s*(\d+)/i);
  if (seasonMatch) {
    season = parseInt(seasonMatch[1], 10);
  }

  // Strip common noisy suffixes and tags
  cleaned = cleaned
    .replace(/[\(\[]\s*(?:Thuyết\s*Minh|Lồng\s*Tiếng|Vietsub|Raw|HD|FHD|4K|Bluray|Special|OVA|ONA)[\)\]]/gi, "")
    .replace(/-\s*(?:Thuyết\s*Minh|Lồng\s*Tiếng|Vietsub)/gi, "")
    .replace(/(?:Thuyết\s*Minh|Lồng\s*Tiếng|Vietsub)\b/gi, "")
    .replace(/[\(\[]\s*\d{4}\s*[\)\]]/g, "") // strip (2024)
    .replace(/(?:-\s*)?Tập\s*\d+(?:\s*-\s*\d+)?/gi, "") // strip - Tập 12 or Tập 12
    .replace(/[\s\-\–\:]+$/g, "") // clean trailing punctuation
    .replace(/\s+/g, " ")
    .trim();

  const candidates: string[] = [];

  // Extract official Romaji title from AnimeVietsub URL slug if provided
  if (animeUrl && typeof animeUrl === "string") {
    const slugMatch = animeUrl.match(/\/phim\/([^\/\?#]+)/);
    if (slugMatch) {
      let slug = slugMatch[1].replace(/-(?:a|i)\d+$/i, ""); // strip internal ID suffix e.g. -a5989
      if (slug && slug.length >= 3) {
        const romajiWithSeason = slug.replace(/-/g, " ").trim();
        const romajiBase = slug
          .replace(/-(?:\d+|part-\d+|season-\d+|\d+(?:st|nd|rd|th)-season)$/i, "")
          .replace(/-/g, " ")
          .trim();

        if (romajiWithSeason && !candidates.includes(romajiWithSeason)) {
          candidates.push(romajiWithSeason);
        }
        if (romajiBase && romajiBase !== romajiWithSeason && !candidates.includes(romajiBase)) {
          candidates.push(romajiBase);
        }
      }
    }
  }

  // Common Vietnamese localized titles dictionary for AniList matching
  const vnTitleMap: Record<string, string> = {
    "thám tử lừng danh conan": "Detective Conan",
    "conan": "Detective Conan",
    "thanh gươm diệt quỷ": "Kimetsu no Yaiba",
    "chú thuật hồi chiến": "Jujutsu Kaisen",
    "đảo hải tặc": "One Piece",
    "vua hải tặc": "One Piece",
    "đại chiến titan": "Shingeki no Kyojin",
    "học viện siêu anh hùng": "Boku no Hero Academia",
    "thất hình đại tội": "Nanatsu no Taizai",
    "thợ săn hạt lựu": "Hunter x Hunter",
    "bảy viên ngọc rồng": "Dragon Ball",
    "hỏa chí": "Naruto",
  };

  const lowerCleaned = cleaned.toLowerCase();
  for (const [vnKey, mappedName] of Object.entries(vnTitleMap)) {
    if (lowerCleaned.includes(vnKey)) {
      candidates.push(mappedName);
      break;
    }
  }

  // Add primary cleaned title
  if (cleaned.length > 0 && !candidates.includes(cleaned)) {
    candidates.push(cleaned);
  }

  // Candidate without season/part suffix for series-level matching on AniList
  const withoutSeason = cleaned
    .replace(/(?:-\s*)?(?:Phần|Mùa|Season|Part)\s*\d+/gi, "")
    .replace(/:\s*Season\s*\d+/gi, "")
    .replace(/[\s\-\–\:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (withoutSeason.length > 0 && !candidates.includes(withoutSeason)) {
    candidates.push(withoutSeason);
  }

  // If there's a colon or dash, try the main title prefix (e.g. "Bleach: Sennen Kessen-hen" -> "Bleach")
  const mainPrefixMatch = cleaned.split(/[:\-\–]/)[0]?.trim();
  if (mainPrefixMatch && mainPrefixMatch.length >= 3 && !candidates.includes(mainPrefixMatch)) {
    candidates.push(mainPrefixMatch);
  }

  // If there's a colon, also try the distinctive part after the colon (e.g. "Honoo no Toukyuujo: Dodge Danko" -> "Dodge Danko")
  if (cleaned.includes(":")) {
    const afterColon = cleaned.split(":")[1]?.trim();
    if (afterColon && afterColon.length >= 3 && !candidates.includes(afterColon)) {
      candidates.push(afterColon);
    }
  }

  // Extra candidate titles (e.g. alternative English/Romaji titles from detail.subTitle)
  if (extraCandidates && Array.isArray(extraCandidates)) {
    for (const extra of extraCandidates) {
      const cleanExtra = extra.trim().replace(/\s*\(\d{4}\)$/, "").trim();
      if (cleanExtra && cleanExtra.length >= 3 && !candidates.includes(cleanExtra)) {
        candidates.push(cleanExtra);
      }
    }
  }

  const primary = candidates[0] || rawTitle.trim();

  return {
    primary,
    candidates,
    year,
    season,
  };
}

/**
 * Checks whether an anime item is a Chinese animation/donghua or tagged as Cartoon on AnimeVietsub.
 */
export function isChineseAnimation(
  detail?: { country?: string; isChineseAnimation?: boolean; genres?: string[] } | null,
  metadata?: { countryOfOrigin?: string | null } | null
): boolean {
  if (detail?.isChineseAnimation) return true;
  if (detail?.country && /trung\s*quốc/i.test(detail.country)) return true;
  if (
    detail?.genres?.some((g) =>
      /cartoon|hoạt\s*hình\s*trung\s*quốc|trung\s*quốc/i.test(g)
    )
  ) {
    return true;
  }
  if (metadata?.countryOfOrigin === "CN") return true;
  return false;
}

