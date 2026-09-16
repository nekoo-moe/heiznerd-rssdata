# Project: AnimeVietsub & AniList Integration for Discord Bot

## Architecture
This project integrates AnimeVietsub episode scraping, AniList GraphQL metadata & panorama banner enrichment, SQLite persistence, Discord Component V2 notification UI, and autonomous polling into the existing Discord bot (`cuutruyen-discord-bot`).

### Data Flow
1. **Domain Resolver**: Probes candidate TLDs (`zip`, `tv`, `site`, `love`, `fan`, `bz`, `pro`, `net`, `cc`) verifying `/phim/` and `tpost` content signature. Reads/writes active domain to SQLite `bot_settings`.
2. **AnimeVietsub Scraper**: Uses resolved active domain to scrape latest releases (`.TPostMv`, `a[href*="/phim/"]`, `.mli-eps`, `img[src]`) and search results.
3. **AniList Service**: Cleans/normalizes anime title, queries AniList GraphQL (`https://graphql.anilist.co`), extracts `bannerImage` (~1900x400 panorama), `coverImage.extraLarge`, genres, studio, averageScore, description, and episodes. Caches responses in-memory and SQLite.
4. **Database Repositories**: `GuildAnimeRepository` manages notification channels per guild. `AnimeEpisodeRepository` tracks notified episode URLs/IDs to prevent duplicate notifications.
5. **Discord Component V2 UI**: `buildAnimeNotificationV2` constructs `ContainerBuilder` with `MediaGalleryBuilder` for the panorama banner, `SectionBuilder` with `ThumbnailBuilder` accessory for details, `ActionRowBuilder` for watch/AniList buttons, and flag `MessageFlags.IsComponentsV2` (32768).
6. **Crawler Manager**: `AnimeCrawlerManager` runs periodic non-blocking checks, discovers new episodes, enriches via AniList, dispatches to subscribed Discord channels, and marks as notified only after successful dispatch (safe dispatch).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Database Migrations | Add `guild_anime_channels` and `notified_episodes` tables in SQLite WAL | M1 | ORIGINAL_REQUEST R3 |
| 2 | Guild Anime Repository | CRUD for server anime notification channel settings | M1 | ORIGINAL_REQUEST R3 |
| 3 | Anime Episode Repository | Check and record notified anime episodes | M1 | ORIGINAL_REQUEST R3 |
| 4 | Domain Resolver Probe | Probe candidate TLDs with `/phim/` and `tpost` signature and label validation | M2 | ORIGINAL_REQUEST R1 |
| 5 | Domain Caching & Fallback | Cache verified domain in `bot_settings`, fan-out fallback probe on failure | M2 | ORIGINAL_REQUEST R1 |
| 6 | AnimeVietsub Latest Scraper | Extract latest anime episodes (title, ep, url, poster, time) | M2 | ORIGINAL_REQUEST R1 |
| 7 | AnimeVietsub Search Scraper | Search anime on AnimeVietsub by query string | M2 | ORIGINAL_REQUEST R1 |
| 8 | AniList GraphQL Client | Query `https://graphql.anilist.co` for anime media | M3 | ORIGINAL_REQUEST R2 |
| 9 | Title Normalizer | Strip years `(2024)`, season tags, Vietnamese text, prioritize Romaji/English | M3 | ORIGINAL_REQUEST R2 |
| 10 | Panorama Banner & Covers | Extract `bannerImage` (~1900x400) and `coverImage.extraLarge` | M3 | ORIGINAL_REQUEST R2 |
| 11 | Metadata Enrichment | Extract genres, main studio, score, episodes, description | M3 | ORIGINAL_REQUEST R2 |
| 12 | AniList Cache Layer | In-memory and SQLite cache with rate limit throttling | M3 | ORIGINAL_REQUEST R2 |
| 13 | Component V2 Notification UI | `ContainerBuilder` with `MediaGalleryBuilder` banner & `SectionBuilder` accessory | M4 | ORIGINAL_REQUEST R4 |
| 14 | Slash Command /setchannel-anime | Configure Discord channel for anime episode updates | M4 | ORIGINAL_REQUEST R4 |
| 15 | Slash Command /removechannel-anime | Unsubscribe guild from anime updates | M4 | ORIGINAL_REQUEST R4 |
| 16 | Slash Command /anime-latest | Display 5 most recently updated anime releases | M4 | ORIGINAL_REQUEST R4 |
| 17 | Slash Command /anime-newest | Display the newest episode update with full Component V2 card | M4 | ORIGINAL_REQUEST R4 |
| 18 | Slash Command /anime-search | Search anime on AnimeVietsub & AniList | M4 | ORIGINAL_REQUEST R4 |
| 19 | Autonomous Polling Loop | Periodic timer polling AnimeVietsub without blocking manga crawler | M5 | ORIGINAL_REQUEST R5 |
| 20 | Safe Dispatch Logic | Record episode in DB only after successful Discord message delivery | M5 | ORIGINAL_REQUEST R5 |
| 21 | Initial Startup Seeding | Seed existing latest episodes on first boot to prevent spam | M5 | ORIGINAL_REQUEST R5 |
| 22 | E2E Acceptance Verification | Pass 100% of Acceptance Criteria and compile clean TypeScript | M6 | ORIGINAL_REQUEST AC |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Database Storage & Migrations | SQLite schema updates (`guild_anime_channels`, `notified_episodes`), `GuildAnimeRepository`, `AnimeEpisodeRepository` | none | DONE |
| M2 | AnimeVietsub Domain Resolver & Scraper | Candidate TLD probe, content signature, `bot_settings` cache, fallback, HTML scraper for latest & search | M1 | DONE |
| M3 | AniList GraphQL Enrichment & Caching | Title normalizer, GraphQL client, panorama banner, cover, metadata, caching | none | PLANNED |
| M4 | Discord Component V2 UI & Slash Commands | Component V2 builders (`ContainerBuilder`, `MediaGalleryBuilder`, `SectionBuilder`), 5 slash commands | M1, M2, M3 | PLANNED |
| M5 | Autonomous Polling & Crawler Manager | `AnimeCrawlerManager` with safe dispatch, initial seeding, non-blocking timer | M1, M2, M3, M4 | PLANNED |
| M6 | Acceptance Verification & Build | Full E2E tests, AC verification, `npm run build` TypeScript check | M1-M5 | PLANNED |

## Interface Contracts

### M1 ↔ M5: Database Repositories
- `GuildAnimeRepository.getChannel(guildId: string): { guild_id: string, channel_id: string } | null`
- `GuildAnimeRepository.getAllChannels(): Array<{ guild_id: string, channel_id: string }>`
- `GuildAnimeRepository.setChannel(guildId: string, channelId: string): void`
- `GuildAnimeRepository.removeChannel(guildId: string): boolean`
- `AnimeEpisodeRepository.isNotified(episodeUrl: string): boolean`
- `AnimeEpisodeRepository.markNotified(item: { anime_title: string, episode_name: string, episode_url: string, anime_url: string }): void`
- `AnimeEpisodeRepository.seedInitial(episodes: Array<{ anime_title: string, episode_name: string, episode_url: string, anime_url: string }>): void`

### M2 ↔ M3, M4, M5: Anime Scraper & Domain Resolver
- `AnimevietsubDomainResolver.resolveDomain(forceRefresh?: boolean): Promise<string>`
- `AnimevietsubScraper.getLatestEpisodes(limit?: number): Promise<AnimeEpisodeItem[]>`
- `AnimevietsubScraper.searchAnime(query: string): Promise<AnimeSearchResult[]>`
- `AnimeEpisodeItem`: `{ animeTitle: string, episodeName: string, episodeUrl: string, animeUrl: string, posterUrl: string, updatedAt?: string }`

### M3 ↔ M4, M5: AniList Service
- `AnilistService.enrich(title: string): Promise<AniListMetadata | null>`
- `normalizeAnimeTitle(rawTitle: string): { primary: string, candidates: string[] }`
- `AniListMetadata`: `{ id: number, romajiTitle: string, englishTitle: string | null, nativeTitle: string | null, bannerImage: string | null, coverImage: string, color: string | null, genres: string[], studio: string | null, averageScore: number | null, episodes: number | null, description: string | null, siteUrl: string }`

### M4 ↔ M5, Discord Client: Component V2 UI & Commands
- `buildAnimeNotificationV2(episode: AnimeEpisodeItem, anilist?: AniListMetadata | null): { flags: number, components: any[] }`
- Commands exported via `ICommand` interface matching `src/discord/commands/index.ts`

## Code Layout
- `src/anime/types.ts`
- `src/anime/domainResolver.ts`
- `src/anime/animevietsubScraper.ts`
- `src/anime/anilistService.ts`
- `src/anime/animeCrawlerManager.ts`
- `src/database/db.ts` (schema migration)
- `src/database/repositories/guildAnimeRepo.ts`
- `src/database/repositories/animeEpisodeRepo.ts`
- `src/discord/animeComponentBuilder.ts`
- `src/discord/commands/setChannelAnime.ts`
- `src/discord/commands/removeChannelAnime.ts`
- `src/discord/commands/animeLatest.ts`
- `src/discord/commands/animeNewest.ts`
- `src/discord/commands/animeSearch.ts`
- `src/discord/commands/index.ts` (registration)
- `src/index.ts` (startup hook)
