import { getDatabase } from "../src/database/db";
import { GuildAnimeRepository, GuildAnimeChannelSetting } from "../src/database/repositories/guildAnimeRepo";
import { AnimeEpisodeRepository, AnimeEpisodeItem, NotifiedEpisodeRecord } from "../src/database/repositories/animeEpisodeRepo";
import { SettingsRepository } from "../src/database/repositories/settingsRepo";
import { logger } from "../src/utils/logger";
import { performance } from "perf_hooks";

// --- Assertion Utilities ---
let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failedCount++;
    logger.error(`[FAIL] ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
  passedCount++;
  logger.success(`[PASS] ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const isMatch = actual === expected;
  if (!isMatch) {
    failedCount++;
    logger.error(`[FAIL] ${message} | Expected: ${JSON.stringify(expected)}, Received: ${JSON.stringify(actual)}`);
    throw new Error(`Assertion Failed: ${message} (Expected ${expected}, got ${actual})`);
  }
  passedCount++;
  logger.success(`[PASS] ${message}`);
}

async function runAnimeDatabaseTests() {
  const startTime = performance.now();
  const RUN_ID = Math.random().toString(36).substring(2, 8);
  logger.info(`=======================================================`);
  logger.info(`STARTING ANIME DATABASE TEST SUITE [Run ID: ${RUN_ID}]`);
  logger.info(`=======================================================`);

  const db = getDatabase();

  try {
    // =========================================================================
    // PHASE 1: Schema Verification & Migration Idempotency
    // =========================================================================
    logger.info("\n--- PHASE 1: Schema Verification & Migration Idempotency ---");

    // 1.1 Verify table existence in sqlite_master
    const masterTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableNames = masterTables.map((t) => t.name);

    assert(tableNames.includes("guild_anime_channels"), "Table 'guild_anime_channels' must exist");
    assert(tableNames.includes("notified_episodes"), "Table 'notified_episodes' must exist");

    // 1.2 Inspect table columns via PRAGMA table_info
    const guildCols = db.pragma("table_info(guild_anime_channels)") as Array<{ name: string; type: string; pk: number; notnull: number }>;
    const guildColNames = guildCols.map((c) => c.name);
    assert(guildColNames.includes("guild_id"), "'guild_anime_channels' must have column 'guild_id'");
    assert(guildColNames.includes("channel_id"), "'guild_anime_channels' must have column 'channel_id'");
    assert(guildColNames.includes("created_at"), "'guild_anime_channels' must have column 'created_at'");
    assert(guildColNames.includes("updated_at"), "'guild_anime_channels' must have column 'updated_at'");

    const guildIdCol = guildCols.find((c) => c.name === "guild_id");
    assert(guildIdCol?.pk === 1, "'guild_id' must be the PRIMARY KEY");

    const epCols = db.pragma("table_info(notified_episodes)") as Array<{ name: string; type: string; pk: number; notnull: number }>;
    const epColNames = epCols.map((c) => c.name);
    assert(epColNames.includes("anime_title"), "'notified_episodes' must have column 'anime_title'");
    assert(epColNames.includes("episode_name"), "'notified_episodes' must have column 'episode_name'");
    assert(epColNames.includes("episode_url"), "'notified_episodes' must have column 'episode_url'");
    assert(epColNames.includes("anime_url"), "'notified_episodes' must have column 'anime_url'");
    assert(epColNames.includes("notified_at"), "'notified_episodes' must have column 'notified_at'");

    // 1.3 Inspect indexes via PRAGMA index_list
    const epIndexes = db.pragma("index_list(notified_episodes)") as Array<{ name: string; unique: number }>;
    const epIndexNames = epIndexes.map((i) => i.name);
    
    // Check unique index on episode_url exists
    const hasUrlIndex = epIndexes.some((i) => (i.name === "idx_notified_episodes_url" || i.name.includes("episode_url") || i.unique === 1));
    assert(hasUrlIndex, "Index on 'episode_url' must exist and enforce uniqueness");

    // Check index on notified_at exists
    const hasNotifiedAtIndex = epIndexNames.some((n) => n.includes("notified_at"));
    assert(hasNotifiedAtIndex, "Index on 'notified_at' ('idx_notified_episodes_notified_at') must exist");

    // 1.4 Test schema creation idempotency (re-applying DDL)
    logger.info("Testing schema idempotency (re-executing schema creation)...");
    const ddlReapply = `
      CREATE TABLE IF NOT EXISTS guild_anime_channels (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_guild_anime_channels_channel ON guild_anime_channels (channel_id);

      CREATE TABLE IF NOT EXISTS notified_episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        anime_title TEXT NOT NULL,
        episode_name TEXT,
        episode_url TEXT NOT NULL UNIQUE,
        anime_url TEXT,
        notified_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notified_episodes_url ON notified_episodes (episode_url);
      CREATE INDEX IF NOT EXISTS idx_notified_episodes_notified_at ON notified_episodes (notified_at DESC);
    `;
    db.exec(ddlReapply);
    logger.success("Schema re-execution completed without error (idempotent)");

    // =========================================================================
    // PHASE 2: GuildAnimeRepository CRUD Operations
    // =========================================================================
    logger.info("\n--- PHASE 2: GuildAnimeRepository CRUD Operations ---");

    const testGuildId = `guild-test-${RUN_ID}`;
    const testChannelId1 = `chan-100-${RUN_ID}`;
    const testChannelId2 = `chan-200-${RUN_ID}`;

    // 2.1 Initial state: should not exist
    const initialGet = GuildAnimeRepository.getChannel(testGuildId) ?? (GuildAnimeRepository as any).getByGuildId?.(testGuildId);
    assertEqual(initialGet, null, "Guild should not exist prior to insertion");

    // 2.2 CREATE: Set channel for guild
    GuildAnimeRepository.setChannel(testGuildId, testChannelId1);
    const createdRecord = GuildAnimeRepository.getChannel(testGuildId) ?? (GuildAnimeRepository as any).getByGuildId?.(testGuildId);
    assert(createdRecord !== null, "Guild anime channel setting must be created");
    assertEqual(createdRecord?.guild_id, testGuildId, "Guild ID must match test guild ID");
    assertEqual(createdRecord?.channel_id, testChannelId1, "Channel ID must match initial channel ID");

    // 2.3 READ ALL: Verify presence in getAllChannels
    const allChannels = GuildAnimeRepository.getAllChannels?.() ?? (GuildAnimeRepository as any).getAll?.();
    assert(Array.isArray(allChannels), "getAllChannels must return an array");
    const foundInAll = allChannels.find((c: GuildAnimeChannelSetting) => c.guild_id === testGuildId);
    assert(foundInAll !== undefined, "Created guild must be present in getAllChannels()");
    assertEqual(foundInAll?.channel_id, testChannelId1, "Channel ID in getAllChannels must match");

    // 2.4 UPDATE (Upsert): Change channel ID for same guild
    const countBeforeUpdate = GuildAnimeRepository.count();
    GuildAnimeRepository.setChannel(testGuildId, testChannelId2);
    const countAfterUpdate = GuildAnimeRepository.count();
    assertEqual(countAfterUpdate, countBeforeUpdate, "Upserting existing guild must not increase row count");

    const updatedRecord = GuildAnimeRepository.getChannel(testGuildId) ?? (GuildAnimeRepository as any).getByGuildId?.(testGuildId);
    assertEqual(updatedRecord?.channel_id, testChannelId2, "Channel ID must be updated to new value");

    // 2.5 DELETE: Remove channel configuration
    const deleteResult = GuildAnimeRepository.removeChannel(testGuildId);
    assert(deleteResult === true, "removeChannel must return true when record was deleted");

    const afterDelete = GuildAnimeRepository.getChannel(testGuildId) ?? (GuildAnimeRepository as any).getByGuildId?.(testGuildId);
    assertEqual(afterDelete, null, "Guild setting must be null after removal");

    // 2.6 DELETE Non-existent: Idempotent remove
    const deleteAgain = GuildAnimeRepository.removeChannel(testGuildId);
    assert(deleteAgain === false, "removeChannel must return false when record does not exist");

    // =========================================================================
    // PHASE 3: AnimeEpisodeRepository Operations & Duplicate Prevention
    // =========================================================================
    logger.info("\n--- PHASE 3: AnimeEpisodeRepository Deduplication & Seeding ---");

    const testEpisodeUrl = `https://animevietsub.tv/phim/test-anime-${RUN_ID}/tap-01.html`;
    const testAnimeUrl = `https://animevietsub.tv/phim/test-anime-${RUN_ID}/`;
    const testAnimeTitle = `Test Anime Title ${RUN_ID}`;
    const testEpisodeName = "Tập 01";

    // 3.1 Initial duplicate check: should be unnotified
    const initiallyNotified = AnimeEpisodeRepository.isNotified(testEpisodeUrl);
    assertEqual(initiallyNotified, false, "Episode should not be notified initially");

    // 3.2 markNotified: Record new notification
    const countBeforeMark = AnimeEpisodeRepository.count();
    AnimeEpisodeRepository.markNotified({
      anime_title: testAnimeTitle,
      episode_name: testEpisodeName,
      episode_url: testEpisodeUrl,
      anime_url: testAnimeUrl,
    });
    const isNowNotified = AnimeEpisodeRepository.isNotified(testEpisodeUrl);
    assert(isNowNotified, "Episode must be marked as notified after markNotified");
    assertEqual(AnimeEpisodeRepository.count(), countBeforeMark + 1, "Count must increase by exactly 1");

    // 3.3 Duplicate prevention: Calling markNotified with duplicate URL
    // Should NOT throw an exception and should NOT create duplicate row
    try {
      AnimeEpisodeRepository.markNotified({
        anime_title: testAnimeTitle,
        episode_name: "Tập 01 Trùng Lặp",
        episode_url: testEpisodeUrl,
        anime_url: testAnimeUrl,
      });
      logger.success("Duplicate markNotified safely ignored (no unhandled error)");
    } catch (err: any) {
      assert(false, `markNotified threw an error on duplicate URL: ${err.message}`);
    }
    assertEqual(AnimeEpisodeRepository.count(), countBeforeMark + 1, "Count must NOT increase on duplicate insertion");

    // 3.4 CamelCase input compatibility test
    const testEpisodeUrlCamel = `https://animevietsub.tv/phim/test-anime-${RUN_ID}/tap-02.html`;
    AnimeEpisodeRepository.markNotified({
      animeTitle: testAnimeTitle,
      episodeName: "Tập 02",
      episodeUrl: testEpisodeUrlCamel,
      animeUrl: testAnimeUrl,
    } as any);
    assert(AnimeEpisodeRepository.isNotified(testEpisodeUrlCamel), "Episode must be notified via camelCase parameters");

    // 3.5 Query recent notifications
    const recentNotified = AnimeEpisodeRepository.getRecentNotified?.(5) ?? (AnimeEpisodeRepository as any).getRecent?.(5);
    assert(Array.isArray(recentNotified), "getRecentNotified must return an array");
    assert(recentNotified.length >= 2, "Recent notifications must contain at least the 2 newly added episodes");
    assertEqual(recentNotified[0].episode_url, testEpisodeUrlCamel, "Most recently added episode must appear first (DESC order)");

    // 3.6 Batch Seeding (seedInitial)
    const seedBatch: AnimeEpisodeItem[] = [1, 2, 3].map((i) => ({
      animeTitle: `Seeded Series ${RUN_ID}`,
      episodeName: `Tập 0${i}`,
      episodeUrl: `https://animevietsub.tv/phim/seed-${RUN_ID}/tap-0${i}.html`,
      animeUrl: `https://animevietsub.tv/phim/seed-${RUN_ID}/`,
    }));

    // Seed batch
    const countBeforeSeed = AnimeEpisodeRepository.count();
    AnimeEpisodeRepository.seedInitial(seedBatch);
    assertEqual(AnimeEpisodeRepository.count(), countBeforeSeed + 3, "Count must increase by 3 after batch seeding");

    for (const ep of seedBatch) {
      assert(AnimeEpisodeRepository.isNotified(ep.episodeUrl ?? ep.episode_url ?? ""), `Seeded episode ${ep.episodeUrl} must be notified`);
    }

    // Re-seed batch with 1 existing and 1 new
    const mixedBatch: AnimeEpisodeItem[] = [
      seedBatch[0], // Duplicate
      {
        animeTitle: `Seeded Series ${RUN_ID}`,
        episodeName: "Tập 04",
        episodeUrl: `https://animevietsub.tv/phim/seed-${RUN_ID}/tap-04.html`,
        animeUrl: `https://animevietsub.tv/phim/seed-${RUN_ID}/`,
      },
    ];
    AnimeEpisodeRepository.seedInitial(mixedBatch);
    assertEqual(AnimeEpisodeRepository.count(), countBeforeSeed + 4, "Count must increase by only 1 when 1 item was duplicate");

    // =========================================================================
    // PHASE 4: Index Verification & Query Performance Benchmark
    // =========================================================================
    logger.info("\n--- PHASE 4: Index Verification & Query Performance ---");

    // 4.1 Verify query execution plans using EXPLAIN QUERY PLAN
    const planLookup = db
      .prepare("EXPLAIN QUERY PLAN SELECT 1 FROM notified_episodes WHERE episode_url = ?")
      .all("dummy_url") as Array<{ detail: string }>;
    const planDetail = planLookup.map((p) => p.detail).join("; ");
    assert(
      planDetail.includes("INDEX") || planDetail.includes("PRIMARY KEY") || planDetail.includes("SEARCH"),
      `Query plan for episode_url lookup must use index. Actual plan: [${planDetail}]`
    );
    assert(!planDetail.includes("SCAN TABLE notified_episodes"), "Query plan must NOT perform a full table SCAN for episode_url lookup");

    const planOrderBy = db
      .prepare("EXPLAIN QUERY PLAN SELECT * FROM notified_episodes ORDER BY notified_at DESC LIMIT 10")
      .all() as Array<{ detail: string }>;
    const orderDetail = planOrderBy.map((p) => p.detail).join("; ");
    assert(
      orderDetail.includes("idx_notified_episodes_notified_at") || orderDetail.includes("INDEX"),
      `Order By query must leverage index idx_notified_episodes_notified_at. Actual plan: [${orderDetail}]`
    );
    assert(!orderDetail.includes("USE TEMP B-TREE"), "Order By query must NOT require a temporary B-tree disk sort");

    // 4.2 Benchmark: Bulk Insert 500 items via seedInitial
    const BENCHMARK_SIZE = 500;
    const benchBatch: AnimeEpisodeItem[] = [];
    for (let i = 0; i < BENCHMARK_SIZE; i++) {
      benchBatch.push({
        animeTitle: `Bench Anime ${RUN_ID}`,
        episodeName: `Tập ${i}`,
        episodeUrl: `https://animevietsub.tv/phim/bench-${RUN_ID}/tap-${i}.html`,
        animeUrl: `https://animevietsub.tv/phim/bench-${RUN_ID}/`,
      });
    }

    const tSeedStart = performance.now();
    AnimeEpisodeRepository.seedInitial(benchBatch);
    const tSeedDuration = performance.now() - tSeedStart;
    logger.info(`Bulk seeded ${BENCHMARK_SIZE} episodes in ${tSeedDuration.toFixed(2)}ms`);
    assert(tSeedDuration < 500, `Bulk insert of ${BENCHMARK_SIZE} items should take < 500ms (took ${tSeedDuration.toFixed(2)}ms)`);

    // 4.3 Benchmark: 1,000 Indexed Lookups via isNotified
    const tLookupStart = performance.now();
    const LOOKUP_COUNT = 1000;
    for (let i = 0; i < LOOKUP_COUNT; i++) {
      // 50% hits, 50% misses
      const url = i % 2 === 0
        ? `https://animevietsub.tv/phim/bench-${RUN_ID}/tap-${i / 2}.html`
        : `https://animevietsub.tv/phim/missing-${RUN_ID}/tap-${i}.html`;
      AnimeEpisodeRepository.isNotified(url);
    }
    const tLookupDuration = performance.now() - tLookupStart;
    const avgLookupMs = tLookupDuration / LOOKUP_COUNT;
    logger.info(`Executed ${LOOKUP_COUNT} isNotified lookups in ${tLookupDuration.toFixed(2)}ms (avg ${avgLookupMs.toFixed(3)}ms/lookup)`);
    assert(tLookupDuration < 300, `1,000 lookups should complete in < 300ms (took ${tLookupDuration.toFixed(2)}ms)`);
    assert(avgLookupMs < 0.3, `Average lookup time should be < 0.3ms (took ${avgLookupMs.toFixed(3)}ms)`);

    // 4.4 Benchmark: 500 Duplicate Collisions via seedInitial
    const tDupStart = performance.now();
    AnimeEpisodeRepository.seedInitial(benchBatch);
    const tDupDuration = performance.now() - tDupStart;
    logger.info(`Re-seeded ${BENCHMARK_SIZE} duplicate episodes in ${tDupDuration.toFixed(2)}ms`);
    assert(tDupDuration < 500, `Re-seeding duplicates should take < 500ms (took ${tDupDuration.toFixed(2)}ms)`);

    // =========================================================================
    // PHASE 5: Edge Cases, Security & Clean Teardown
    // =========================================================================
    logger.info("\n--- PHASE 5: Edge Cases, Unicode & Security Sanitization ---");

    // 5.1 Unicode, Japanese, Vietnamese & Special Symbols
    const specialTitle = "【Oshi no Ko】Dược Sư Tự Sự & Frieren: Pháp Sư Tiễn Táng (Phần 2) - Tập Đặc Biệt 4K \"HD\" 'Director's Cut' 🔥";
    const specialUrl = `https://animevietsub.tv/phim/special-${RUN_ID}/tap-special.html?source=hd&lang=vi#watch`;
    AnimeEpisodeRepository.markNotified({
      animeTitle: specialTitle,
      episodeName: "Tập Đặc Biệt",
      episodeUrl: specialUrl,
      animeUrl: `https://animevietsub.tv/phim/special-${RUN_ID}/`,
    });
    assert(AnimeEpisodeRepository.isNotified(specialUrl), "Episode with special characters and query parameters must be notified");
    const specialRecent = AnimeEpisodeRepository.getRecentNotified?.(1)?.[0];
    assertEqual(specialRecent?.anime_title, specialTitle, "Unicode title with quotes and emojis must be preserved exactly");

    // 5.2 SQL Injection Resilience
    const sqlInjectGuild = `test-guild-${RUN_ID}'; DROP TABLE guild_anime_channels; --`;
    const sqlInjectChan = `chan-${RUN_ID}' OR '1'='1`;
    GuildAnimeRepository.setChannel(sqlInjectGuild, sqlInjectChan);
    const retrievedInject = GuildAnimeRepository.getChannel(sqlInjectGuild);
    assert(retrievedInject !== null, "SQL injection string must be safely treated as literal string");
    assertEqual(retrievedInject?.channel_id, sqlInjectChan, "Channel ID with SQL metacharacters must be preserved intact");

    // Verify table was NOT dropped
    const masterCheck = db.prepare("SELECT name FROM sqlite_master WHERE name = 'guild_anime_channels'").get();
    assert(masterCheck !== undefined, "Table guild_anime_channels must still exist (SQL injection prevented)");

    // Cleanup injected guild
    GuildAnimeRepository.removeChannel(sqlInjectGuild);

    // =========================================================================
    // PHASE 6: SettingsRepository Key-Value Store Operations
    // =========================================================================
    logger.info("\n--- PHASE 6: SettingsRepository Key-Value Store Operations ---");
    const testSettingKey = `anime_domain_${RUN_ID}`;
    const testSettingVal1 = "https://animevietsub.tv";
    const testSettingVal2 = "https://animevietsub.cc";

    // 6.1 Initial get should be null
    assertEqual(SettingsRepository.get(testSettingKey), null, "Setting should not exist initially");

    // 6.2 Set setting
    SettingsRepository.set(testSettingKey, testSettingVal1);
    assertEqual(SettingsRepository.get(testSettingKey), testSettingVal1, "Setting must match inserted value");

    // 6.3 Update setting (upsert)
    SettingsRepository.set(testSettingKey, testSettingVal2);
    assertEqual(SettingsRepository.get(testSettingKey), testSettingVal2, "Setting must match updated value");

    // 6.4 Delete setting
    const deleteSettingRes = SettingsRepository.delete(testSettingKey);
    assert(deleteSettingRes === true, "SettingsRepository.delete must return true for existing key");
    assertEqual(SettingsRepository.get(testSettingKey), null, "Deleted setting must return null");

    // 6.5 Delete non-existent setting
    const deleteAgainSettingRes = SettingsRepository.delete(testSettingKey);
    assert(deleteAgainSettingRes === false, "SettingsRepository.delete must return false for non-existing key");

  } finally {
    // =========================================================================
    // TEARDOWN: Purge all test run data
    // =========================================================================
    logger.info("\n--- CLEANUP & TEARDOWN ---");
    const delChannels = db.prepare("DELETE FROM guild_anime_channels WHERE guild_id LIKE ?").run(`%${RUN_ID}%`);
    const delEpisodes = db.prepare("DELETE FROM notified_episodes WHERE episode_url LIKE ? OR anime_title LIKE ?").run(`%${RUN_ID}%`, `%${RUN_ID}%`);
    const delSettings = db.prepare("DELETE FROM bot_settings WHERE key LIKE ?").run(`%${RUN_ID}%`);
    logger.info(`Purged test data: ${delChannels.changes} guild channels, ${delEpisodes.changes} notified episodes, ${delSettings.changes} settings`);
  }

  const totalTime = ((performance.now() - startTime) / 1000).toFixed(3);
  logger.info(`\n=======================================================`);
  logger.success(`ALL DATABASE ANIME TESTS PASSED!`);
  logger.info(`Total Tests: ${passedCount} passed, ${failedCount} failed`);
  logger.info(`Execution Time: ${totalTime}s`);
  logger.info(`=======================================================`);
}

// Execute test suite
runAnimeDatabaseTests().catch((err) => {
  logger.error("Database Anime Test Suite Failed with unhandled error:", err);
  process.exit(1);
});
