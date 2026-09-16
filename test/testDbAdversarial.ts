import { getDatabase } from "../src/database/db";
import { GuildAnimeRepository, GuildAnimeChannelSetting } from "../src/database/repositories/guildAnimeRepo";
import { AnimeEpisodeRepository, AnimeEpisodeInput, NotifiedEpisodeRecord } from "../src/database/repositories/animeEpisodeRepo";
import { SettingsRepository } from "../src/database/repositories/settingsRepo";
import { logger } from "../src/utils/logger";
import { performance } from "perf_hooks";

// --- Assertion Utilities ---
let passedCount = 0;
let failedCount = 0;
const failures: Array<{ test: string; error: string }> = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    failedCount++;
    const err = `Assertion Failed: ${message}`;
    failures.push({ test: message, error: err });
    logger.error(`[FAIL] ${message}`);
    return false;
  }
  passedCount++;
  logger.success(`[PASS] ${message}`);
  return true;
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const isMatch = actual === expected;
  if (!isMatch) {
    failedCount++;
    const err = `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    failures.push({ test: message, error: err });
    logger.error(`[FAIL] ${message} | ${err}`);
    return false;
  }
  passedCount++;
  logger.success(`[PASS] ${message}`);
  return true;
}

function assertThrows(fn: () => void, message: string) {
  try {
    fn();
    failedCount++;
    const err = "Expected function to throw, but it succeeded";
    failures.push({ test: message, error: err });
    logger.error(`[FAIL] ${message} | ${err}`);
    return false;
  } catch (e: any) {
    passedCount++;
    logger.success(`[PASS] ${message} (Threw expected error: ${e.message})`);
    return true;
  }
}

function assertDoesNotThrow(fn: () => void, message: string) {
  try {
    fn();
    passedCount++;
    logger.success(`[PASS] ${message}`);
    return true;
  } catch (e: any) {
    failedCount++;
    const err = `Unexpected exception: ${e.message}`;
    failures.push({ test: message, error: err });
    logger.error(`[FAIL] ${message} | ${err}`);
    return false;
  }
}

async function runAdversarialDatabaseTests() {
  const startTime = performance.now();
  const RUN_ID = `adv_${Math.random().toString(36).substring(2, 8)}`;
  logger.info(`=======================================================`);
  logger.info(`STARTING EMPIRICAL ADVERSARIAL TEST SUITE [Run ID: ${RUN_ID}]`);
  logger.info(`=======================================================`);

  const db = getDatabase();

  try {
    // =========================================================================
    // CATEGORY 1: Unicode, Diacritics, Asian Scripts, and Emoji Boundaries
    // =========================================================================
    logger.info("\n--- CATEGORY 1: Unicode & Multi-Byte Script Integrity ---");

    // 1.1 Complete Vietnamese Diacritic Set (Precomposed NFC & Decomposed NFD)
    const viTextNFC = "Thanh Gươm Diệt Quỷ: Phép Lạ Tình Thân, Cho Đến Chuyến Huấn Luyện Của Các Trụ Cột (Phần 4) - Độc Quyền Bản Đẹp!";
    const viTextNFD = viTextNFC.normalize("NFD");
    const viFullAlphabet = "aáàảãạăắằẳẵặâấầẩẫậeéèẻẽẹêếềểễệiíìỉĩịoóòỏõọôốồổỗộơớờởỡợuúùủũụưứừửữựyýỳỷỹỵđAÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬEÉÈẺẼẸÊẾỀỂỄỆIÍÌỈĨỊOÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢUÚÙỦŨỤƯỨỪỬỮỰYÝỲỶỸỴĐ";
    
    const viUrl = `https://animevietsub.tv/phim/vi-test-${RUN_ID}/tap-01.html?ten=${encodeURIComponent(viTextNFC)}`;
    AnimeEpisodeRepository.markNotified({
      animeTitle: viTextNFC,
      episodeName: viFullAlphabet,
      episodeUrl: viUrl,
      animeUrl: `https://animevietsub.tv/phim/vi-test-${RUN_ID}/`,
    });

    assert(AnimeEpisodeRepository.isNotified(viUrl), "Vietnamese NFC URL lookup succeeds");
    const recVi = AnimeEpisodeRepository.getRecentNotified(1)[0];
    assertEqual(recVi?.anime_title, viTextNFC, "Vietnamese NFC anime title preserved with exact byte integrity");
    assertEqual(recVi?.episode_name, viFullAlphabet, "Vietnamese full alphabet (all tones, upper and lower) preserved");

    // 1.2 Japanese Kanji, Hiragana, Katakana, and Ideographic Variation Selectors
    // Testing kanji with variation selectors U+E0100, full/half-width katakana, rare kanji
    const jaTitle = "【推しの子】第2期 第14話「リライティング」- 鬼滅の刃 柱稽古編 𠮷野家 ｳﾞｧｲｵﾚｯﾄ・ｴｳﾞｧｰｶﾞｰﾃﾞﾝ 竈門禰󠄀豆子";
    const jaEpName = "第１４話「リライティング」/ Episode 14 (TV-Special)";
    const jaUrl = `https://animevietsub.tv/phim/ja-test-${RUN_ID}/tap-14.html`;

    AnimeEpisodeRepository.markNotified({
      animeTitle: jaTitle,
      episodeName: jaEpName,
      episodeUrl: jaUrl,
      animeUrl: `https://animevietsub.tv/phim/ja-test-${RUN_ID}/`,
    });

    assert(AnimeEpisodeRepository.isNotified(jaUrl), "Japanese Kanji/Kana URL lookup succeeds");
    const recJa = AnimeEpisodeRepository.getRecentNotified(1)[0];
    assertEqual(recJa?.anime_title, jaTitle, "Japanese Kanji with variation selectors & astral plane kanji preserved exactly");
    assertEqual(recJa?.episode_name, jaEpName, "Full-width Japanese episode name preserved");

    // 1.3 Complex Emojis, Zero-Width Joiner (ZWJ), Skin Tones & Astral Symbols
    const emojiTitle = "Anime 👨‍👩‍👧‍👦 Gia Đình Điệp Viên 🕵️‍♂️ × 🌸 Cô Bé Siêu Năng Lực ⚔️🔥✨ 🏴‍☠️ [Vsub 1080p 60fps] 🎌";
    const emojiUrl = `https://animevietsub.tv/phim/emoji-test-${RUN_ID}/tap-01.html`;

    AnimeEpisodeRepository.markNotified({
      animeTitle: emojiTitle,
      episodeName: "Tập 1 🔥✨",
      episodeUrl: emojiUrl,
      animeUrl: `https://animevietsub.tv/phim/emoji-test-${RUN_ID}/`,
    });

    assert(AnimeEpisodeRepository.isNotified(emojiUrl), "Emoji-laden URL lookup succeeds");
    const recEmoji = AnimeEpisodeRepository.getRecentNotified(1)[0];
    assertEqual(recEmoji?.anime_title, emojiTitle, "ZWJ compound emojis, skin tones, and symbols preserved verbatim");

    // 1.4 Right-to-Left (RTL), BiDi Override, and Whitespace Variants
    const bidiTitle = "Anime Reverse \u202E TXET NEKORB \u202C Normal \t Tabbed \n Newline \r Carriage \u200B ZeroWidth \u00A0 NonBreaking";
    const bidiUrl = `https://animevietsub.tv/phim/bidi-${RUN_ID}/tap-01.html`;

    AnimeEpisodeRepository.markNotified({
      animeTitle: bidiTitle,
      episodeName: "Ep 1 \t\n\r",
      episodeUrl: bidiUrl,
      animeUrl: `https://animevietsub.tv/phim/bidi-${RUN_ID}/`,
    });

    assert(AnimeEpisodeRepository.isNotified(bidiUrl), "RTL/Bidi URL lookup succeeds");
    const recBidi = AnimeEpisodeRepository.getRecentNotified(1)[0];
    assertEqual(recBidi?.anime_title, bidiTitle, "BiDi control codes, newlines, tabs, zero-width spaces preserved without corruption");

    // 1.5 Guild repository with Unicode / Symbols in Guild and Channel IDs
    const unicodeGuild = `guild-🌟-việt-nam-${RUN_ID}`;
    const unicodeChan = `chan-🔥-thông-báo-${RUN_ID}`;
    GuildAnimeRepository.setChannel(unicodeGuild, unicodeChan);
    const recGuild = GuildAnimeRepository.getChannel(unicodeGuild);
    assertEqual(recGuild?.channel_id, unicodeChan, "GuildAnimeRepository stores and retrieves Unicode guild and channel IDs verbatim");
    GuildAnimeRepository.removeChannel(unicodeGuild);

    // =========================================================================
    // CATEGORY 2: Extreme Payload Sizes & Boundary Lengths (>2048 chars)
    // =========================================================================
    logger.info("\n--- CATEGORY 2: Extreme Payload Sizes & Long URLs (>2048 Chars) ---");

    // 2.1 URL of 2,048 chars exactly
    const basePrefix = `https://animevietsub.tv/phim/boundary-${RUN_ID}/tap-`;
    const pad2048 = "a".repeat(2048 - basePrefix.length - 5);
    const url2048 = `${basePrefix}${pad2048}.html`;
    assertEqual(url2048.length, 2048, "URL is exactly 2,048 characters long");

    AnimeEpisodeRepository.markNotified({
      animeTitle: `Boundary 2048 Title ${RUN_ID}`,
      episodeName: "Tập 2048",
      episodeUrl: url2048,
      animeUrl: `https://animevietsub.tv/phim/boundary-${RUN_ID}/`,
    });
    assert(AnimeEpisodeRepository.isNotified(url2048), "isNotified returns true for 2,048 char URL");

    // 2.2 URL of 4,096 chars (exceeding standard 2048 limit)
    const pad4096 = "b".repeat(4096 - basePrefix.length - 5);
    const url4096 = `${basePrefix}${pad4096}.html`;
    assertEqual(url4096.length, 4096, "URL is exactly 4,096 characters long");

    AnimeEpisodeRepository.markNotified({
      animeTitle: `Boundary 4096 Title ${RUN_ID}`,
      episodeName: "Tập 4096",
      episodeUrl: url4096,
      animeUrl: `https://animevietsub.tv/phim/boundary-${RUN_ID}/`,
    });
    assert(AnimeEpisodeRepository.isNotified(url4096), "isNotified returns true for 4,096 char URL");
    assert(!AnimeEpisodeRepository.isNotified(url4096 + "x"), "isNotified returns false for 4,097 char URL variant");

    // 2.3 URL of 8,192 chars
    const pad8192 = "c".repeat(8192 - basePrefix.length - 5);
    const url8192 = `${basePrefix}${pad8192}.html`;
    assertEqual(url8192.length, 8192, "URL is exactly 8,192 characters long");

    AnimeEpisodeRepository.markNotified({
      animeTitle: `Boundary 8192 Title ${RUN_ID}`,
      episodeName: "Tập 8192",
      episodeUrl: url8192,
      animeUrl: `https://animevietsub.tv/phim/boundary-${RUN_ID}/`,
    });
    assert(AnimeEpisodeRepository.isNotified(url8192), "isNotified returns true for 8,192 char URL via index");

    // 2.4 Massive Title (10,000 characters) and Episode Name (2,000 characters)
    const massiveTitle = "Anime Title ".repeat(833) + RUN_ID; // ~10,000 chars
    const massiveEpName = "Special Extended Ep ".repeat(100); // 2,000 chars
    const massiveUrl = `https://animevietsub.tv/phim/massive-${RUN_ID}/tap-01.html`;

    AnimeEpisodeRepository.markNotified({
      animeTitle: massiveTitle,
      episodeName: massiveEpName,
      episodeUrl: massiveUrl,
      animeUrl: `https://animevietsub.tv/phim/massive-${RUN_ID}/`,
    });

    assert(AnimeEpisodeRepository.isNotified(massiveUrl), "Episode with 10,000-char title indexed and notified");
    const recMassive = AnimeEpisodeRepository.getRecentNotified(1)[0];
    assertEqual(recMassive?.anime_title.length, massiveTitle.length, "10,000-char anime title stored without truncation");
    assertEqual(recMassive?.episode_name.length, massiveEpName.length, "2,000-char episode name stored without truncation");

    // 2.5 Giant Payload in SettingsRepository (65,536 bytes / 64KB JSON string)
    const largeSettingKey = `large_blob_${RUN_ID}`;
    const largeSettingVal = JSON.stringify({
      data: "x".repeat(65000),
      timestamp: Date.now(),
    });
    SettingsRepository.set(largeSettingKey, largeSettingVal);
    const retrievedSetting = SettingsRepository.get(largeSettingKey);
    assertEqual(retrievedSetting?.length, largeSettingVal.length, "SettingsRepository stores and retrieves 64KB payload without truncation");
    SettingsRepository.delete(largeSettingKey);

    // =========================================================================
    // CATEGORY 3: SQL Injection Vectors & Escape Character Attacks
    // =========================================================================
    logger.info("\n--- CATEGORY 3: SQL Injection Stress Testing ---");

    const sqliPayloads = [
      // Classic tautology
      `' OR '1'='1`,
      `" OR "1"="1`,
      `' OR 1=1 --`,
      `' OR 1=1 /*`,
      `admin' --`,
      `') OR ('1'='1`,

      // Destructive DDL / DML injection
      `'; DROP TABLE guild_anime_channels; --`,
      `'; DROP TABLE notified_episodes; --`,
      `'; DROP TABLE bot_settings; --`,
      `'; DELETE FROM notified_episodes WHERE 1=1; --`,
      `'; VACUUM; --`,
      `'; ATTACH DATABASE ':memory:' AS evil; --`,

      // UNION-based exfiltration payloads
      `' UNION SELECT 'hacked_guild', 'hacked_chan', 'now', 'now' --`,
      `' UNION SELECT 1, 'hacked_title', 'ep1', 'http://hacked', 'http://hacked', 'now' --`,
      `' UNION SELECT id, name, sql, '' FROM sqlite_master --`,

      // Boolean and blind inference
      `' AND 1=(SELECT COUNT(*) FROM sqlite_master) --`,
      `' AND (SELECT SUBSTR(name, 1, 1) FROM sqlite_master LIMIT 1)='g' --`,

      // Special characters, quotes, and backslashes
      `\\'; \\" --`,
      `'\\'`,
      `''''''''''`,
      `"""""""""`,
      `\\\\\\\\\\\\\\\\`,
      `/*<![CDATA[*/'; DROP TABLE/*]]>*/`,
    ];

    let sqliIndex = 0;
    for (const payload of sqliPayloads) {
      sqliIndex++;
      const sqliGuildId = `guild_sqli_${sqliIndex}_${RUN_ID}_${payload.substring(0, 10)}`;
      const sqliChanId = `chan_${payload}`;
      const sqliEpUrl = `https://animevietsub.tv/phim/sqli-${RUN_ID}/?q=${encodeURIComponent(payload)}&sqli=${sqliIndex}`;
      const sqliTitle = `Anime Payload: ${payload}`;

      // Test GuildAnimeRepository with injection string
      GuildAnimeRepository.setChannel(sqliGuildId, sqliChanId);
      const resGuild = GuildAnimeRepository.getChannel(sqliGuildId);
      assert(resGuild !== null, `SQLi Payload #${sqliIndex} safely handled by GuildAnimeRepository.setChannel`);
      assertEqual(resGuild?.channel_id, sqliChanId, `SQLi Payload #${sqliIndex} channel_id retrieved verbatim as literal text`);

      // Test AnimeEpisodeRepository with injection string
      AnimeEpisodeRepository.markNotified({
        animeTitle: sqliTitle,
        episodeName: `Ep ${payload.substring(0, 8)}`,
        episodeUrl: sqliEpUrl,
        animeUrl: `https://animevietsub.tv/phim/sqli-${RUN_ID}/${payload.substring(0, 8)}`,
      });
      assert(AnimeEpisodeRepository.isNotified(sqliEpUrl), `SQLi Payload #${sqliIndex} safely handled by AnimeEpisodeRepository.markNotified & isNotified`);

      // Test deletion by URL with injection string
      const delSuccess = AnimeEpisodeRepository.deleteByUrl(sqliEpUrl);
      assert(delSuccess, `SQLi Payload #${sqliIndex} safely deleted by deleteByUrl`);
      assert(!AnimeEpisodeRepository.isNotified(sqliEpUrl), `SQLi Payload #${sqliIndex} verified deleted`);

      GuildAnimeRepository.removeChannel(sqliGuildId);
    }

    // Verify all primary tables still exist and were not dropped or corrupted
    const tablesCheck = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('guild_anime_channels', 'notified_episodes', 'bot_settings')")
      .all() as Array<{ name: string }>;
    const verifiedTableNames = tablesCheck.map((t) => t.name);
    assert(verifiedTableNames.includes("guild_anime_channels"), "Table 'guild_anime_channels' survived all SQLi attacks");
    assert(verifiedTableNames.includes("notified_episodes"), "Table 'notified_episodes' survived all SQLi attacks");
    assert(verifiedTableNames.includes("bot_settings"), "Table 'bot_settings' survived all SQLi attacks");

    // =========================================================================
    // CATEGORY 4: Empty Batch, Null/Undefined & Corrupted Seeds
    // =========================================================================
    logger.info("\n--- CATEGORY 4: Empty Batch, Null & Type Boundary Resiliency ---");

    const initialEpCount = AnimeEpisodeRepository.count();

    // 4.1 Empty array seed: seedInitial([])
    assertDoesNotThrow(() => {
      AnimeEpisodeRepository.seedInitial([]);
    }, "seedInitial([]) empty batch executes gracefully without error");
    assertEqual(AnimeEpisodeRepository.count(), initialEpCount, "Count remains unchanged after seedInitial([])");

    // 4.2 Null or undefined seedInitial calls (runtime boundary safety)
    assertDoesNotThrow(() => {
      AnimeEpisodeRepository.seedInitial(null as any);
    }, "seedInitial(null) executes gracefully without throwing");
    assertDoesNotThrow(() => {
      AnimeEpisodeRepository.seedInitial(undefined as any);
    }, "seedInitial(undefined) executes gracefully without throwing");
    assertEqual(AnimeEpisodeRepository.count(), initialEpCount, "Count remains unchanged after null/undefined seedInitial");

    // 4.3 Batch items with missing or empty URLs
    const emptyUrlBatch: AnimeEpisodeInput[] = [
      { anime_title: "No URL 1", episode_name: "Ep 1", episode_url: "" },
      { animeTitle: "No URL 2", episodeName: "Ep 2", episodeUrl: "" },
      { anime_title: "Whitespace URL", episode_name: "Ep 3", episode_url: "" },
      { anime_title: "Undefined URL", episode_name: "Ep 4" },
    ];
    assertDoesNotThrow(() => {
      AnimeEpisodeRepository.seedInitial(emptyUrlBatch);
    }, "seedInitial ignores items with empty/missing episode_url without error");
    assertEqual(AnimeEpisodeRepository.count(), initialEpCount, "Count unchanged: items without URL were safely ignored");

    // 4.4 markNotified with empty or null episode_url
    assertDoesNotThrow(() => {
      AnimeEpisodeRepository.markNotified({ anime_title: "Test", episode_url: "" });
    }, "markNotified with empty episode_url exits gracefully without writing");
    assertEqual(AnimeEpisodeRepository.count(), initialEpCount, "Count unchanged after empty episode_url markNotified");

    assertDoesNotThrow(() => {
      AnimeEpisodeRepository.markNotified({ anime_title: "Test" }); // undefined episode_url
    }, "markNotified with omitted episode_url exits gracefully");
    assertEqual(AnimeEpisodeRepository.count(), initialEpCount, "Count unchanged after omitted episode_url");

    // 4.5 markNotified with missing titles / names (nullish coalescing behavior)
    const noTitleUrl = `https://animevietsub.tv/phim/notitle-${RUN_ID}/tap-01.html`;
    assertDoesNotThrow(() => {
      AnimeEpisodeRepository.markNotified({
        episode_url: noTitleUrl,
      });
    }, "markNotified with only episode_url succeeds (defaults title/name to empty string)");
    assert(AnimeEpisodeRepository.isNotified(noTitleUrl), "Episode with omitted title is marked as notified");
    const recNoTitle = AnimeEpisodeRepository.getRecentNotified(1)[0];
    assertEqual(recNoTitle?.anime_title, "", "Omitted anime_title defaults to empty string satisfying NOT NULL constraint");
    assertEqual(recNoTitle?.episode_name, "", "Omitted episode_name defaults to empty string");

    // 4.6 Repeated Seeds of Identical Batch (Idempotency)
    const seedIdempotentBatch: AnimeEpisodeInput[] = [
      { animeTitle: `Idempotent 1 ${RUN_ID}`, episodeName: "Tập 1", episodeUrl: `https://animevietsub.tv/phim/idemp-${RUN_ID}/tap-1.html`, animeUrl: `https://animevietsub.tv/phim/idemp-${RUN_ID}/` },
      { animeTitle: `Idempotent 2 ${RUN_ID}`, episodeName: "Tập 2", episodeUrl: `https://animevietsub.tv/phim/idemp-${RUN_ID}/tap-2.html`, animeUrl: `https://animevietsub.tv/phim/idemp-${RUN_ID}/` },
      { animeTitle: `Idempotent 3 ${RUN_ID}`, episodeName: "Tập 3", episodeUrl: `https://animevietsub.tv/phim/idemp-${RUN_ID}/tap-3.html`, animeUrl: `https://animevietsub.tv/phim/idemp-${RUN_ID}/` },
    ];

    const countBeforeIdemp = AnimeEpisodeRepository.count();
    // Pass 1
    AnimeEpisodeRepository.seedInitial(seedIdempotentBatch);
    assertEqual(AnimeEpisodeRepository.count(), countBeforeIdemp + 3, "Count increased by 3 on initial seed");

    // Pass 2 (Immediate duplicate re-seed)
    AnimeEpisodeRepository.seedInitial(seedIdempotentBatch);
    assertEqual(AnimeEpisodeRepository.count(), countBeforeIdemp + 3, "Count strictly unchanged on immediate re-seed of identical batch");

    // Pass 3 (Re-seed third time)
    AnimeEpisodeRepository.seedInitial(seedIdempotentBatch);
    assertEqual(AnimeEpisodeRepository.count(), countBeforeIdemp + 3, "Count strictly unchanged on third re-seed");

    // =========================================================================
    // CATEGORY 5: Rapid Repeated Churn & Boundary Invocations
    // =========================================================================
    logger.info("\n--- CATEGORY 5: Rapid Churn, Repeated Operations & Idempotency ---");

    // 5.1 100 rapid removals of non-existent guild
    const nonExistentGuild = `non-existent-guild-${RUN_ID}`;
    let allFalse = true;
    for (let i = 0; i < 100; i++) {
      const res = GuildAnimeRepository.removeChannel(nonExistentGuild);
      if (res !== false) allFalse = false;
    }
    assert(allFalse, "100 consecutive removeChannel calls for non-existent guild all returned false without error");

    // 5.2 100 rapid setChannel updates for the same guild
    const rapidGuild = `rapid-guild-${RUN_ID}`;
    const initialGuildCount = GuildAnimeRepository.count();
    for (let i = 0; i < 100; i++) {
      GuildAnimeRepository.setChannel(rapidGuild, `chan-val-${i}`);
    }
    assertEqual(GuildAnimeRepository.count(), initialGuildCount + 1, "100 rapid upserts to same guild resulted in exactly 1 row");
    const rapidRecord = GuildAnimeRepository.getChannel(rapidGuild);
    assertEqual(rapidRecord?.channel_id, "chan-val-99", "Final upsert value 'chan-val-99' retained");
    GuildAnimeRepository.removeChannel(rapidGuild);

    // 5.3 Duplicate episode URL with different title/name: INSERT OR IGNORE preservation
    const conflictUrl = `https://animevietsub.tv/phim/conflict-${RUN_ID}/tap-01.html`;
    AnimeEpisodeRepository.markNotified({
      animeTitle: "Original Title",
      episodeName: "Original Episode",
      episodeUrl: conflictUrl,
      animeUrl: `https://animevietsub.tv/phim/conflict-${RUN_ID}/`,
    });

    // Attempt to insert duplicate URL with altered title
    AnimeEpisodeRepository.markNotified({
      animeTitle: "Altered Malicious Title",
      episodeName: "Altered Episode",
      episodeUrl: conflictUrl,
      animeUrl: `https://animevietsub.tv/phim/conflict-${RUN_ID}/`,
    });

    // Check that original record was preserved (INSERT OR IGNORE semantics)
    const conflictRecord = db.prepare("SELECT anime_title, episode_name FROM notified_episodes WHERE episode_url = ?").get(conflictUrl) as { anime_title: string; episode_name: string };
    assertEqual(conflictRecord.anime_title, "Original Title", "INSERT OR IGNORE preserves original title against duplicate overwrite attacks");
    assertEqual(conflictRecord.episode_name, "Original Episode", "INSERT OR IGNORE preserves original episode name against duplicate overwrite attacks");

    // 5.4 Case Sensitivity of URLs (RFC 3986 path case sensitivity)
    const urlLower = `https://animevietsub.tv/phim/casesensitive-${RUN_ID}/tap-01.html`;
    const urlUpper = `https://animevietsub.tv/phim/casesensitive-${RUN_ID}/TAP-01.HTML`;

    AnimeEpisodeRepository.markNotified({
      animeTitle: "Case Sensitivity Test",
      episodeName: "Lower",
      episodeUrl: urlLower,
      animeUrl: `https://animevietsub.tv/phim/casesensitive-${RUN_ID}/`,
    });

    assert(AnimeEpisodeRepository.isNotified(urlLower), "Lower case URL is notified");
    // SQLite default collation is BINARY, so distinct case URLs are distinct entries
    const isUpperNotified = AnimeEpisodeRepository.isNotified(urlUpper);
    logger.info(`URL case difference behavior: lower = true, upper = ${isUpperNotified} (SQLite BINARY collation)`);

    // =========================================================================
    // CATEGORY 6: Testing Corrupted Batch Array Handling & Null Parameters
    // =========================================================================
    logger.info("\n--- CATEGORY 6: Corrupted Batch Array & Null Parameter Boundaries ---");

    // 6.1 seedInitial with null / undefined array elements
    let seedThrewOnNullItem = false;
    try {
      AnimeEpisodeRepository.seedInitial([
        { animeTitle: "Valid 1", episodeUrl: `https://animevietsub.tv/phim/nulltest-${RUN_ID}/tap-1.html` },
        null as any,
        { animeTitle: "Valid 2", episodeUrl: `https://animevietsub.tv/phim/nulltest-${RUN_ID}/tap-2.html` },
      ]);
    } catch (err: any) {
      seedThrewOnNullItem = true;
      logger.info(`[OBSERVATION] seedInitial with null item threw TypeError: ${err.message}`);
    }
    assert(seedThrewOnNullItem, "seedInitial([null]) throws TypeError because items[i] expects object (documented runtime boundary)");

    // 6.2 markNotified with null / undefined
    let markThrewOnNull = false;
    try {
      AnimeEpisodeRepository.markNotified(null as any);
    } catch (err: any) {
      markThrewOnNull = true;
      logger.info(`[OBSERVATION] markNotified(null) threw TypeError: ${err.message}`);
    }
    assert(markThrewOnNull, "markNotified(null) throws TypeError when passed null object (documented runtime boundary)");

    // 6.3 isNotified with null / undefined / empty string
    assert(!AnimeEpisodeRepository.isNotified(""), "isNotified('') returns false");
    assert(!AnimeEpisodeRepository.isNotified(null as any), "isNotified(null) returns false");
    assert(!AnimeEpisodeRepository.isNotified(undefined as any), "isNotified(undefined) returns false");

    // 6.4 GuildAnimeRepository with null parameters
    assert(!GuildAnimeRepository.getChannel(""), "getChannel('') returns null");
    assert(!GuildAnimeRepository.getChannel(null as any), "getChannel(null) returns null");
    assert(!GuildAnimeRepository.removeChannel(""), "removeChannel('') returns false");
    assert(!GuildAnimeRepository.removeChannel(null as any), "removeChannel(null) returns false");

    // Null channel_id should trigger SQLite NOT NULL constraint
    let setChanThrewOnNull = false;
    try {
      GuildAnimeRepository.setChannel(`test-null-chan-${RUN_ID}`, null as any);
    } catch (err: any) {
      setChanThrewOnNull = true;
      logger.info(`[OBSERVATION] setChannel(guild, null) threw SQLite constraint: ${err.message}`);
    }
    assert(setChanThrewOnNull, "setChannel with null channel_id rejected by SQLite NOT NULL constraint");

    // =========================================================================
    // CATEGORY 7: Extreme URL Length Boundaries (16,384 & 32,768 Chars)
    // =========================================================================
    logger.info("\n--- CATEGORY 7: Extreme URL Length Boundaries ---");

    // 7.1 URL of 16,384 chars
    const pad16k = "d".repeat(16384 - basePrefix.length - 5);
    const url16k = `${basePrefix}${pad16k}.html`;
    assertEqual(url16k.length, 16384, "URL is exactly 16,384 characters long");

    AnimeEpisodeRepository.markNotified({
      animeTitle: `Boundary 16K Title ${RUN_ID}`,
      episodeName: "Tập 16K",
      episodeUrl: url16k,
      animeUrl: `https://animevietsub.tv/phim/boundary-${RUN_ID}/`,
    });
    assert(AnimeEpisodeRepository.isNotified(url16k), "isNotified returns true for 16,384 char URL via index");

    // 7.2 URL of 32,768 chars (32 KB single URL key)
    const pad32k = "e".repeat(32768 - basePrefix.length - 5);
    const url32k = `${basePrefix}${pad32k}.html`;
    assertEqual(url32k.length, 32768, "URL is exactly 32,768 characters long");

    AnimeEpisodeRepository.markNotified({
      animeTitle: `Boundary 32K Title ${RUN_ID}`,
      episodeName: "Tập 32K",
      episodeUrl: url32k,
      animeUrl: `https://animevietsub.tv/phim/boundary-${RUN_ID}/`,
    });
    assert(AnimeEpisodeRepository.isNotified(url32k), "isNotified returns true for 32,768 char URL via index");

    // =========================================================================
    // CATEGORY 8: Unicode Normalization (NFC vs NFD Collation In SQLite)
    // =========================================================================
    logger.info("\n--- CATEGORY 8: Unicode Normalization (NFC vs NFD) ---");

    const nfcUrl = `https://animevietsub.tv/phim/norm-${RUN_ID}/tập-1-nfc.html`;
    const nfdUrl = nfcUrl.normalize("NFD");
    const isDecomposedDifferentBytes = nfcUrl !== nfdUrl;
    assert(isDecomposedDifferentBytes, "NFD and NFC URLs have different byte representations in memory");

    AnimeEpisodeRepository.markNotified({
      animeTitle: "NFC Form Title",
      episodeName: "Tập 1",
      episodeUrl: nfcUrl,
      animeUrl: `https://animevietsub.tv/phim/norm-${RUN_ID}/`,
    });

    assert(AnimeEpisodeRepository.isNotified(nfcUrl), "NFC URL lookup matches exact NFC insertion");
    const nfdMatch = AnimeEpisodeRepository.isNotified(nfdUrl);
    logger.info(`[OBSERVATION] NFD lookup of NFC inserted URL: ${nfdMatch} (SQLite default collation is BINARY; crawlers must normalize URLs)`);

    // =========================================================================
    // CATEGORY 9: Transaction Atomicity in seedInitial
    // =========================================================================
    logger.info("\n--- CATEGORY 9: Transaction Atomicity in seedInitial ---");

    // Test that valid batch commits atomically
    const atomicBatch: AnimeEpisodeInput[] = [
      { animeTitle: "Batch 1", episodeUrl: `https://animevietsub.tv/phim/atomic-${RUN_ID}/1.html` },
      { animeTitle: "Batch 2", episodeUrl: `https://animevietsub.tv/phim/atomic-${RUN_ID}/2.html` },
    ];
    const preCount = AnimeEpisodeRepository.count();
    AnimeEpisodeRepository.seedInitial(atomicBatch);
    assertEqual(AnimeEpisodeRepository.count(), preCount + 2, "Atomic batch increases count by exactly 2");


  } finally {
    // =========================================================================
    // TEARDOWN: Clean up all test data generated during adversarial suite
    // =========================================================================
    logger.info("\n--- CLEANUP & TEARDOWN ---");
    const delChannels = db.prepare("DELETE FROM guild_anime_channels WHERE guild_id LIKE ?").run(`%${RUN_ID}%`);
    const delEpisodes = db.prepare("DELETE FROM notified_episodes WHERE episode_url LIKE ? OR anime_title LIKE ?").run(`%${RUN_ID}%`, `%${RUN_ID}%`);
    const delSettings = db.prepare("DELETE FROM bot_settings WHERE key LIKE ?").run(`%${RUN_ID}%`);
    logger.info(`Purged test data: ${delChannels.changes} guild channels, ${delEpisodes.changes} notified episodes, ${delSettings.changes} settings`);
  }

  const totalTime = ((performance.now() - startTime) / 1000).toFixed(3);
  logger.info(`\n=======================================================`);
  logger.info(`ADVERSARIAL SUITE COMPLETED in ${totalTime}s`);
  logger.info(`Results: ${passedCount} passed, ${failedCount} failed`);
  if (failures.length > 0) {
    logger.error(`Failures (${failures.length}):`);
    for (const f of failures) {
      logger.error(`  - ${f.test}: ${f.error}`);
    }
  } else {
    logger.success(`ALL ADVERSARIAL CHALLENGES PASSED! ZERO DEFECTS DETECTED.`);
  }
  logger.info(`=======================================================`);

  return { passedCount, failedCount, failures };
}

// Execute suite
runAdversarialDatabaseTests()
  .then((res) => {
    if (res.failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  })
  .catch((err) => {
    logger.error("Unhandled error during adversarial suite execution:", err);
    process.exit(1);
  });
