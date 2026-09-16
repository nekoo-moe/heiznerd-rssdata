import { getDatabase } from "../db";

export class SettingsRepository {
  /**
   * Retrieve a setting value by key.
   */
  static get(key: string): string | null {
    const db = getDatabase();
    const stmt = db.prepare("SELECT value FROM bot_settings WHERE key = ?");
    const row = stmt.get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  /**
   * Set or update a key-value setting.
   */
  static set(key: string, value: string): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO bot_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(key, value);
  }

  /**
   * Delete a setting by key.
   */
  static delete(key: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare("DELETE FROM bot_settings WHERE key = ?");
    const res = stmt.run(key);
    return res.changes > 0;
  }
}
