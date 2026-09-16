# E2E Test Infra: AnimeVietsub & AniList Discord Bot Integration

## Test Philosophy
- Opaque-box, requirement-driven testing covering all acceptance criteria in `ORIGINAL_REQUEST.md`.
- Methodology: Category-Partition, Boundary Value Analysis, Pairwise Combinatorial, and Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|----------------------|:------:|:------:|:------:|
| 1 | Database Migrations & Repos | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 2 | Domain Resolver Probe & Fallback | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | AnimeVietsub Latest & Search Scraper | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | AniList GraphQL & Title Normalization | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 5 | Component V2 Notification UI & Slash Commands | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 6 | Autonomous Polling & Safe Dispatch | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: `tsx` running test suites in `test/`
- Key Test Scripts:
  - `test/testDbAnime.ts`: Validates table schema, CRUD operations, and idempotency.
  - `test/testDomainResolver.ts`: Probes live candidate TLDs, verifies signature filtering and SQLite caching.
  - `test/testAnimevietsubScraper.ts`: Scrapes >= 5 latest episodes, checks title, ep, link, poster.
  - `test/testAnilistEnrichment.ts`: Tests title normalizer, queries AniList GraphQL, checks HTTP 200 bannerImage (~1900x400) and metadata.
  - `test/testComponentV2Anime.ts`: Validates ContainerBuilder, MediaGalleryBuilder for banner, SectionBuilder accessory constraint, and MessageFlags.IsComponentsV2 (32768).
  - `test/testAnimeCrawlerManager.ts`: Tests safe dispatch, polling cycle, and duplicate prevention with SQLite.
  - Build Check: `npm run build` (`npx tsc --noEmit`).

## Acceptance Criteria Mapping
- [ ] Domain resolver connects to live AnimeVietsub domain, stores cache in SQLite.
- [ ] Scraper extracts at least 5 latest anime episodes with valid title, episode number, link.
- [ ] AniList enrichment successfully retrieves panorama bannerImage with HTTP 200 and full metadata.
- [ ] Component V2 payload contains MediaGalleryBuilder banner, valid SectionBuilder accessory, and flag 32768.
- [ ] Slash commands registered and formatted correctly.
- [ ] Episode crawler prevents duplicate notifications.
- [ ] TypeScript compilation succeeds with zero errors.
