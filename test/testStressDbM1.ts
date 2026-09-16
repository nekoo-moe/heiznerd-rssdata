import { getDatabase, closeDatabase } from "../src/database/db";
import { GuildAnimeRepository } from "../src/database/repositories/guildAnimeRepo";
import { AnimeEpisodeRepository, AnimeEpisodeItem } from "../src/database/repositories/animeEpisodeRepo";
import { logger } from "../src/utils/logger";
import { performance } from "perf_hooks";
import { spawn } from "child_process";
import path from "path";

// =============================================================================
// CLI Worker Mode Routing (for Multi-Process Concurrency Testing)
// =============================================================================
// CLI arguments parsed at bottom of file

// ---------------------------------------------------------------------------
// Worker Sub-Process Logic
// ---------------------------------------------------------------------------
async function runChildWorker(workerType: string, runId: string) {
  try {
    const db = getDatabase();
    // Ensure timeout and journal mode
    db.pragma("busy_timeout = 5000");

    if (workerType === "insert-proc-1") {
      // Process 1: Write 300 unique episodes
      for (let i = 0; i < 300; i++) {
        AnimeEpisodeRepository.markNotified({
          animeTitle: `Worker 1 Anime ${runId}`,
          episodeName: `Tập ${i}`,
          episodeUrl: `https://animevietsub.tv/phim/worker1-${runId}/tap-${i}.html`,
          animeUrl: `https://animevietsub.tv/phim/worker1-${runId}/`,
        });
      }
      process.exit(0);
    } else if (workerType === "insert-proc-2") {
      // Process 2: Write 300 unique episodes
      for (let i = 0; i < 300; i++) {
        AnimeEpisodeRepository.markNotified({
          animeTitle: `Worker 2 Anime ${runId}`,
          episodeName: `Tập ${i}`,
          episodeUrl: `https://animevietsub.tv/phim/worker2-${runId}/tap-${i}.html`,
          animeUrl: `https://animevietsub.tv/phim/worker2-${runId}/`,
        });
      }
      process.exit(0);
    } else if (workerType === "duplicate-collision-proc") {
      // Process 3: Intentionally duplicate Process 1 episodes in parallel
      for (let i = 0; i < 300; i++) {
        AnimeEpisodeRepository.markNotified({
          animeTitle: `Worker 3 Dup Anime ${runId}`,
          episodeName: `Tập ${i}`,
          episodeUrl: `https://animevietsub.tv/phim/worker1-${runId}/tap-${i}.html`,
          animeUrl: `https://animevietsub.tv/phim/worker1-${runId}/`,
        });
      }
      process.exit(0);
    } else if (workerType === "guild-channel-churn") {
      // Process 4: Rapidly upsert and delete guild channels
      for (let i = 0; i < 200; i++) {
        const guildId = `churn-guild-${runId}-${i % 20}`;
        const channelId = `churn-chan-${runId}-${i}`;
        GuildAnimeRepository.setChannel(guildId, channelId);
        GuildAnimeRepository.getChannel(guildId);
        if (i % 5 === 0) {
          GuildAnimeRepository.removeChannel(guildId);
        }
      }
      process.exit(0);
    } else {
      console.error(`Unknown worker type: ${workerType}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`Worker [${workerType}] failed:`, err);
    process.exit(1);
  }
}

// =============================================================================
// Main Empirical Stress Harness
// =============================================================================
interface AssertionStats {
  passed: number;
  failed: number;
}

const stats: AssertionStats = { passed: 0, failed: 0 };

function assert(condition: boolean, message: string) {
  if (!condition) {
    stats.failed++;
    logger.error(`[CHALLENGE FAIL] ${message}`);
    throw new Error(`Challenge Assertion Failed: ${message}`);
  }
  stats.passed++;
  logger.success(`[CHALLENGE PASS] ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const isMatch = actual === expected;
  if (!isMatch) {
    stats.failed++;
    logger.error(`[CHALLENGE FAIL] ${message} | Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)}`);
    throw new Error(`Challenge Assertion Failed: ${message} (Expected ${expected}, got ${actual})`);
  }
  stats.passed++;
  logger.success(`[CHALLENGE PASS] ${message}`);
}

function calculatePercentiles(latencies: number[]): { p50: number; p95: number; p99: number; max: number; avg: number } {
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = sum / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const max = sorted[sorted.length - 1];
  return { p50, p95, p99, max, avg };
}

async function runMainStressSuite() {
  const overallStart = performance.now();
  const RUN_ID = `stress_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  logger.info(`================================================================`);
  logger.info(`🔥 STARTING M1 ADVERSARIAL STRESS & CONCURRENCY TEST SUITE 🔥`);
  logger.info(`Run ID: ${RUN_ID}`);
  logger.info(`Target: AnimeEpisodeRepository & GuildAnimeRepository`);
  logger.info(`================================================================`);

  const db = getDatabase();

  try {
    // -------------------------------------------------------------------------
    // CHALLENGE 1: High-Volume Individual markNotified (1,500 items)
    // -------------------------------------------------------------------------
    logger.info("\n>>> CHALLENGE 1: High-Volume Sequential markNotified (1,500 items) <<<");
    const countBeforeCh1 = AnimeEpisodeRepository.count();
    const NUM_ITEMS_CH1 = 1500;
    const markLatencies: number[] = [];

    const ch1Start = performance.now();
    for (let i = 0; i < NUM_ITEMS_CH1; i++) {
      const epUrl = `https://animevietsub.tv/phim/stress-vol1-${RUN_ID}/tap-${i}.html`;
      const t0 = performance.now();
      AnimeEpisodeRepository.markNotified({
        animeTitle: `Stress Series ${RUN_ID}`,
        episodeName: `Tập ${i}`,
        episodeUrl: epUrl,
        animeUrl: `https://animevietsub.tv/phim/stress-vol1-${RUN_ID}/`,
      });
      markLatencies.push(performance.now() - t0);
    }
    const ch1TotalDuration = performance.now() - ch1Start;
    const markMetrics = calculatePercentiles(markLatencies);

    logger.info(`Inserted ${NUM_ITEMS_CH1} individual episodes in ${ch1TotalDuration.toFixed(2)}ms`);
    logger.info(`  Throughput: ${(NUM_ITEMS_CH1 / (ch1TotalDuration / 1000)).toFixed(1)} ops/sec`);
    logger.info(`  Avg: ${markMetrics.avg.toFixed(3)}ms | p50: ${markMetrics.p50.toFixed(3)}ms | p95: ${markMetrics.p95.toFixed(3)}ms | Max: ${markMetrics.max.toFixed(3)}ms`);

    const countAfterCh1 = AnimeEpisodeRepository.count();
    assertEqual(countAfterCh1, countBeforeCh1 + NUM_ITEMS_CH1, `Count must increase by exactly ${NUM_ITEMS_CH1}`);

    // -------------------------------------------------------------------------
    // CHALLENGE 2: High-Volume Indexed isNotified (2,000 lookups)
    // -------------------------------------------------------------------------
    logger.info("\n>>> CHALLENGE 2: High-Volume Indexed isNotified Lookups (2,000 items) <<<");
    const LOOKUP_COUNT = 2000;
    const lookupLatencies: number[] = [];
    let positiveHits = 0;
    let negativeMisses = 0;

    const ch2Start = performance.now();
    for (let i = 0; i < LOOKUP_COUNT; i++) {
      const isHit = i % 2 === 0;
      const targetUrl = isHit
        ? `https://animevietsub.tv/phim/stress-vol1-${RUN_ID}/tap-${i % NUM_ITEMS_CH1}.html`
        : `https://animevietsub.tv/phim/stress-missing-${RUN_ID}/tap-${i}.html`;

      const t0 = performance.now();
      const result = AnimeEpisodeRepository.isNotified(targetUrl);
      lookupLatencies.push(performance.now() - t0);

      if (isHit) {
        if (result) positiveHits++;
      } else {
        if (!result) negativeMisses++;
      }
    }
    const ch2TotalDuration = performance.now() - ch2Start;
    const lookupMetrics = calculatePercentiles(lookupLatencies);

    logger.info(`Completed ${LOOKUP_COUNT} lookups in ${ch2TotalDuration.toFixed(2)}ms`);
    logger.info(`  Throughput: ${(LOOKUP_COUNT / (ch2TotalDuration / 1000)).toFixed(1)} lookups/sec`);
    logger.info(`  Avg: ${lookupMetrics.avg.toFixed(3)}ms | p50: ${lookupMetrics.p50.toFixed(3)}ms | p95: ${lookupMetrics.p95.toFixed(3)}ms | Max: ${lookupMetrics.max.toFixed(3)}ms`);

    assertEqual(positiveHits, LOOKUP_COUNT / 2, `All ${LOOKUP_COUNT / 2} existing URLs must return true (100% sensitivity)`);
    assertEqual(negativeMisses, LOOKUP_COUNT / 2, `All ${LOOKUP_COUNT / 2} missing URLs must return false (100% specificity)`);
    assert(lookupMetrics.p95 < 1.0, `p95 lookup latency must be < 1.0ms (actual: ${lookupMetrics.p95.toFixed(3)}ms)`);

    // -------------------------------------------------------------------------
    // CHALLENGE 3: High-Volume Batch Seeding (1,500 items in single transaction)
    // -------------------------------------------------------------------------
    logger.info("\n>>> CHALLENGE 3: High-Volume Batch Seeding via seedInitial (1,500 items) <<<");
    const NUM_SEED_ITEMS = 1500;
    const seedBatch: AnimeEpisodeItem[] = [];
    for (let i = 0; i < NUM_SEED_ITEMS; i++) {
      seedBatch.push({
        animeTitle: `Seed Series ${RUN_ID}`,
        episodeName: `Tập ${i}`,
        episodeUrl: `https://animevietsub.tv/phim/seed-vol2-${RUN_ID}/tap-${i}.html`,
        animeUrl: `https://animevietsub.tv/phim/seed-vol2-${RUN_ID}/`,
      });
    }

    const countBeforeCh3 = AnimeEpisodeRepository.count();
    const ch3Start = performance.now();
    AnimeEpisodeRepository.seedInitial(seedBatch);
    const ch3TotalDuration = performance.now() - ch3Start;

    logger.info(`Batch-seeded ${NUM_SEED_ITEMS} items in ${ch3TotalDuration.toFixed(2)}ms (${(NUM_SEED_ITEMS / (ch3TotalDuration / 1000)).toFixed(1)} items/sec)`);
    assert(ch3TotalDuration < 1000, `Batch seed of 1,500 items must complete in < 1,000ms (took ${ch3TotalDuration.toFixed(2)}ms)`);

    const countAfterCh3 = AnimeEpisodeRepository.count();
    assertEqual(countAfterCh3, countBeforeCh3 + NUM_SEED_ITEMS, `Count must increase by exactly ${NUM_SEED_ITEMS}`);

    // Verify sample from seeded batch
    assert(AnimeEpisodeRepository.isNotified(seedBatch[0].episodeUrl!), "First seeded item must be marked notified");
    assert(AnimeEpisodeRepository.isNotified(seedBatch[NUM_SEED_ITEMS - 1].episodeUrl!), "Last seeded item must be marked notified");

    // -------------------------------------------------------------------------
    // CHALLENGE 4: Duplicate Constraint Collision Avalanche
    // -------------------------------------------------------------------------
    logger.info("\n>>> CHALLENGE 4: Duplicate Unique Constraint Collision Avalanche <<<");

    // 4.1 1,000 Sequential individual duplicate collisions
    logger.info("Attempting 1,000 sequential duplicate markNotified collisions...");
    const countBeforeDupSeq = AnimeEpisodeRepository.count();
    const dupCollisionsStart = performance.now();
    for (let i = 0; i < 1000; i++) {
      // Re-insert URLs from Challenge 1
      const dupUrl = `https://animevietsub.tv/phim/stress-vol1-${RUN_ID}/tap-${i}.html`;
      AnimeEpisodeRepository.markNotified({
        animeTitle: `Attempted Overwrite Title ${i}`,
        episodeName: `Attempted Overwrite Ep ${i}`,
        episodeUrl: dupUrl,
        animeUrl: `https://animevietsub.tv/phim/fake/`,
      });
    }
    const dupCollisionsDuration = performance.now() - dupCollisionsStart;
    logger.info(`Handled 1,000 duplicate collisions in ${dupCollisionsDuration.toFixed(2)}ms (zero exceptions thrown)`);

    const countAfterDupSeq = AnimeEpisodeRepository.count();
    assertEqual(countAfterDupSeq, countBeforeDupSeq, "Total count must NOT change when 1,000 duplicate items are inserted");

    // 4.2 Verify State Integrity: original record was NOT overwritten by duplicate collision
    const testSampleUrl = `https://animevietsub.tv/phim/stress-vol1-${RUN_ID}/tap-0.html`;
    const recordCheck = db.prepare("SELECT anime_title, episode_name FROM notified_episodes WHERE episode_url = ?").get(testSampleUrl) as any;
    assertEqual(recordCheck.anime_title, `Stress Series ${RUN_ID}`, "Original record must remain untouched by duplicate insertion");

    // 4.3 Batch duplicate flood via seedInitial (1,500 duplicates)
    logger.info("Batch re-seeding 1,500 existing items via seedInitial...");
    const countBeforeBatchDup = AnimeEpisodeRepository.count();
    AnimeEpisodeRepository.seedInitial(seedBatch);
    assertEqual(AnimeEpisodeRepository.count(), countBeforeBatchDup, "Batch seeding 1,500 duplicates must NOT change row count");

    // 4.4 Mixed batch (500 duplicates + 500 brand new items)
    logger.info("Batch seeding 1,000 items (500 duplicates + 500 new)...");
    const mixedBatch: AnimeEpisodeItem[] = [];
    // 500 existing items
    for (let i = 0; i < 500; i++) {
      mixedBatch.push(seedBatch[i]);
    }
    // 500 brand new items
    for (let i = 0; i < 500; i++) {
      mixedBatch.push({
        animeTitle: `Mixed New Series ${RUN_ID}`,
        episodeName: `Tập ${i}`,
        episodeUrl: `https://animevietsub.tv/phim/mixed-new-${RUN_ID}/tap-${i}.html`,
        animeUrl: `https://animevietsub.tv/phim/mixed-new-${RUN_ID}/`,
      });
    }

    const countBeforeMixed = AnimeEpisodeRepository.count();
    AnimeEpisodeRepository.seedInitial(mixedBatch);
    assertEqual(AnimeEpisodeRepository.count(), countBeforeMixed + 500, "Mixed batch must insert exactly the 500 new items");

    // 4.5 Intra-batch duplicate collision (same URL repeated 10 times in 1 batch)
    logger.info("Batch seeding intra-batch duplicate collisions (same URL 10 times)...");
    const intraBatch: AnimeEpisodeItem[] = [];
    const intraUrl = `https://animevietsub.tv/phim/intra-dup-${RUN_ID}/tap-1.html`;
    for (let i = 0; i < 10; i++) {
      intraBatch.push({
        animeTitle: `Intra Title ${i}`,
        episodeName: `Intra Ep ${i}`,
        episodeUrl: intraUrl,
        animeUrl: `https://animevietsub.tv/phim/intra-dup-${RUN_ID}/`,
      });
    }
    const countBeforeIntra = AnimeEpisodeRepository.count();
    AnimeEpisodeRepository.seedInitial(intraBatch);
    assertEqual(AnimeEpisodeRepository.count(), countBeforeIntra + 1, "Intra-batch duplicate must only insert 1 unique row");

    // -------------------------------------------------------------------------
    // CHALLENGE 5: Edge Case Inputs & Boundary Stress
    // -------------------------------------------------------------------------
    logger.info("\n>>> CHALLENGE 5: Edge Cases, Malformed Inputs & Boundary Stress <<<");

    const countBeforeEdge = AnimeEpisodeRepository.count();

    // 5.1 Empty string & undefined episode URL handling
    AnimeEpisodeRepository.markNotified({ animeTitle: "Empty URL", episodeUrl: "" });
    AnimeEpisodeRepository.markNotified({ animeTitle: "Undefined URL" } as any);
    AnimeEpisodeRepository.markNotified({} as any);
    assertEqual(AnimeEpisodeRepository.count(), countBeforeEdge, "Empty/undefined episodeUrl must be gracefully skipped without insertion or error");

    // 5.2 seedInitial with empty array or invalid elements
    AnimeEpisodeRepository.seedInitial([]);
    AnimeEpisodeRepository.seedInitial([{ episodeUrl: "" }, { animeTitle: "No Ep Url" }] as any);
    assertEqual(AnimeEpisodeRepository.count(), countBeforeEdge, "seedInitial with empty or invalid items must be safe and no-op");

    // 5.3 Massive Payload Stress (50KB Title, 2048-byte URL)
    logger.info("Testing extreme payload sizes...");
    const hugeTitle = "A".repeat(50000);
    const hugeUrl = `https://animevietsub.tv/phim/huge-${RUN_ID}/` + "x".repeat(2000) + ".html";
    AnimeEpisodeRepository.markNotified({
      animeTitle: hugeTitle,
      episodeName: "Tập Siêu Lớn",
      episodeUrl: hugeUrl,
      animeUrl: "https://animevietsub.tv/phim/huge/",
    });
    assert(AnimeEpisodeRepository.isNotified(hugeUrl), "Extreme payload size (50KB title, 2048b URL) must be correctly stored and queried");
    const retrievedHuge = db.prepare("SELECT length(anime_title) as len FROM notified_episodes WHERE episode_url = ?").get(hugeUrl) as any;
    assertEqual(retrievedHuge.len, 50000, "50,000 character title must be preserved in full without truncation");

    // 5.4 Multilingual Unicode & Emoji Stress
    const complexUnicodeTitle = "【2026】Thám Tử Lừng Danh Conan: Tàu Ngầm Sắt Màu Đen 🚢 劇場版 名探偵コナン 黒鉄の魚影 (Sub Việt & Thuyết Minh 1080p 60fps) — Đạo diễn: Yuzuru Tachikawa / Studio: TMS Entertainment";
    const complexUnicodeUrl = `https://animevietsub.tv/phim/conan-kurogane-${RUN_ID}/tap-full-đặc-biệt.html?lang=vi&v=2`;
    AnimeEpisodeRepository.markNotified({
      animeTitle: complexUnicodeTitle,
      episodeName: "Bản Chiếu Rạp",
      episodeUrl: complexUnicodeUrl,
      animeUrl: "https://animevietsub.tv/phim/conan-kurogane/",
    });
    assert(AnimeEpisodeRepository.isNotified(complexUnicodeUrl), "Complex Vietnamese & Japanese title with emojis must be notified");

    // -------------------------------------------------------------------------
    // CHALLENGE 6: Single-Process Asynchronous Interleaved Concurrency
    // -------------------------------------------------------------------------
    logger.info("\n>>> CHALLENGE 6: Single-Process Asynchronous Interleaved Concurrency <<<");
    const NUM_ASYNC_TASKS = 200;
    const asyncTasks: Promise<void>[] = [];

    const asyncCountStart = AnimeEpisodeRepository.count();
    let asyncEpisodesAdded = 0;

    for (let i = 0; i < NUM_ASYNC_TASKS; i++) {
      const taskType = i % 4;
      if (taskType === 0) {
        // Task A: Write episode
        const epIndex = i;
        asyncEpisodesAdded++;
        asyncTasks.push(
          new Promise<void>((resolve) => {
            setImmediate(() => {
              AnimeEpisodeRepository.markNotified({
                animeTitle: `Async Title ${epIndex}`,
                episodeName: `Tập ${epIndex}`,
                episodeUrl: `https://animevietsub.tv/phim/async-${RUN_ID}/tap-${epIndex}.html`,
                animeUrl: `https://animevietsub.tv/phim/async-${RUN_ID}/`,
              });
              resolve();
            });
          })
        );
      } else if (taskType === 1) {
        // Task B: Query isNotified
        asyncTasks.push(
          new Promise<void>((resolve) => {
            setImmediate(() => {
              AnimeEpisodeRepository.isNotified(`https://animevietsub.tv/phim/stress-vol1-${RUN_ID}/tap-0.html`);
              AnimeEpisodeRepository.isNotified(`https://animevietsub.tv/phim/nonexistent-${i}.html`);
              resolve();
            });
          })
        );
      } else if (taskType === 2) {
        // Task C: Upsert guild channel
        const guildNum = i % 25;
        asyncTasks.push(
          new Promise<void>((resolve) => {
            setImmediate(() => {
              GuildAnimeRepository.setChannel(`async-guild-${RUN_ID}-${guildNum}`, `chan-${i}`);
              resolve();
            });
          })
        );
      } else {
        // Task D: Query guild channels and get recent
        const guildNum = i % 25;
        asyncTasks.push(
          new Promise<void>((resolve) => {
            setImmediate(() => {
              GuildAnimeRepository.getChannel(`async-guild-${RUN_ID}-${guildNum}`);
              AnimeEpisodeRepository.getRecent(5);
              resolve();
            });
          })
        );
      }
    }

    const tAsyncStart = performance.now();
    await Promise.all(asyncTasks);
    const tAsyncDuration = performance.now() - tAsyncStart;
    logger.info(`Resolved ${NUM_ASYNC_TASKS} interleaved async tasks in ${tAsyncDuration.toFixed(2)}ms`);

    assertEqual(
      AnimeEpisodeRepository.count(),
      asyncCountStart + asyncEpisodesAdded,
      `Count must increase by exactly the number of async episode insertions (${asyncEpisodesAdded})`
    );

    // -------------------------------------------------------------------------
    // CHALLENGE 7: Multi-Process True Parallel Concurrency & Lock Contention
    // -------------------------------------------------------------------------
    logger.info("\n>>> CHALLENGE 7: Multi-Process True Parallel Concurrency & Lock Contention <<<");
    logger.info("Spawning 4 concurrent child Node.js processes writing to SQLite WAL simultaneously...");

    const scriptPath = "test/testStressDbM1.ts";

    function spawnWorker(workerType: string): Promise<number> {
      return new Promise((resolve, reject) => {
        const child = spawn("npx", ["tsx", scriptPath, "--worker", workerType, "--run-id", RUN_ID], {
          shell: true,
          stdio: "inherit",
          cwd: process.cwd(),
        });
        child.on("close", (code) => resolve(code ?? 0));
        child.on("error", (err) => reject(err));
      });
    }

    const tMultiStart = performance.now();
    const workerPromises = [
      spawnWorker("insert-proc-1"),          // 300 items
      spawnWorker("insert-proc-2"),          // 300 items
      spawnWorker("duplicate-collision-proc"), // 300 duplicate items colliding with proc 1 in real time
      spawnWorker("guild-channel-churn"),    // 200 guild channel upserts/deletes
    ];

    const exitCodes = await Promise.all(workerPromises);
    const tMultiDuration = performance.now() - tMultiStart;

    logger.info(`All 4 child worker processes completed in ${tMultiDuration.toFixed(2)}ms`);
    for (let i = 0; i < exitCodes.length; i++) {
      assertEqual(exitCodes[i], 0, `Worker Process ${i + 1} must exit with code 0 (no lock timeout, no crash)`);
    }

    // Verify Process 1 items: 300 items
    assert(AnimeEpisodeRepository.isNotified(`https://animevietsub.tv/phim/worker1-${RUN_ID}/tap-0.html`), "Worker 1 first item must exist");
    assert(AnimeEpisodeRepository.isNotified(`https://animevietsub.tv/phim/worker1-${RUN_ID}/tap-299.html`), "Worker 1 last item must exist");

    // Verify Process 2 items: 300 items
    assert(AnimeEpisodeRepository.isNotified(`https://animevietsub.tv/phim/worker2-${RUN_ID}/tap-0.html`), "Worker 2 first item must exist");
    assert(AnimeEpisodeRepository.isNotified(`https://animevietsub.tv/phim/worker2-${RUN_ID}/tap-299.html`), "Worker 2 last item must exist");

    // Verify no corrupted duplicates from Worker 3
    const worker1SampleCount = db
      .prepare("SELECT count(*) as cnt FROM notified_episodes WHERE episode_url = ?")
      .get(`https://animevietsub.tv/phim/worker1-${RUN_ID}/tap-0.html`) as any;
    assertEqual(worker1SampleCount.cnt, 1, "Concurrent duplicate collision must result in exactly 1 row");

    // -------------------------------------------------------------------------
    // CHALLENGE 8: SQLite B-Tree & WAL File Integrity Check
    // -------------------------------------------------------------------------
    logger.info("\n>>> CHALLENGE 8: SQLite B-Tree & Page Integrity Check <<<");
    const integrityCheck = db.prepare("PRAGMA integrity_check").all() as Array<{ integrity_check: string }>;
    logger.info(`PRAGMA integrity_check result: ${JSON.stringify(integrityCheck)}`);
    assertEqual(integrityCheck[0].integrity_check, "ok", "Database PRAGMA integrity_check must report 'ok'");

    const quickCheck = db.prepare("PRAGMA quick_check").all() as Array<{ quick_check: string }>;
    assertEqual(quickCheck[0].quick_check, "ok", "Database PRAGMA quick_check must report 'ok'");

    const foreignKeyCheck = db.prepare("PRAGMA foreign_key_check").all();
    assertEqual(foreignKeyCheck.length, 0, "Database PRAGMA foreign_key_check must find zero violations");

  } finally {
    // -------------------------------------------------------------------------
    // TEARDOWN & CLEANUP
    // -------------------------------------------------------------------------
    logger.info("\n--- TEARDOWN & PURGE OF TEST DATA ---");
    const delChannels = db.prepare("DELETE FROM guild_anime_channels WHERE guild_id LIKE ?").run(`%${RUN_ID}%`);
    const delEpisodes = db.prepare("DELETE FROM notified_episodes WHERE episode_url LIKE ? OR anime_title LIKE ?").run(`%${RUN_ID}%`, `%${RUN_ID}%`);
    logger.info(`Purged stress test artifacts: ${delChannels.changes} guild channels, ${delEpisodes.changes} notified episodes`);

    // Verify post-cleanup database integrity
    const finalIntegrity = db.prepare("PRAGMA quick_check").all() as any[];
    assertEqual(finalIntegrity[0].quick_check, "ok", "Post-cleanup quick_check must be 'ok'");
  }

  const totalTime = ((performance.now() - overallStart) / 1000).toFixed(3);
  logger.info(`\n================================================================`);
  logger.success(`🎉 ALL CHALLENGES PASSED SUCCESSFULLY!`);
  logger.info(`Summary: ${stats.passed} passed, ${stats.failed} failed`);
  logger.info(`Total Stress Test Execution Time: ${totalTime}s`);
  logger.info(`================================================================`);
}

// ---------------------------------------------------------------------------
// Execution Dispatcher
// ---------------------------------------------------------------------------
const cliArgs = process.argv.slice(2);
const workerIdx = cliArgs.indexOf("--worker");

if (workerIdx !== -1) {
  const workerType = cliArgs[workerIdx + 1];
  const runId = cliArgs[cliArgs.indexOf("--run-id") + 1] || "default";
  runChildWorker(workerType, runId);
} else {
  runMainStressSuite().catch((err) => {
    logger.error("FATAL: Stress test suite crashed with unhandled exception:", err);
    process.exit(1);
  });
}
