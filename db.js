const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'bot.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_configs (
    guild_id TEXT PRIMARY KEY,
    role_id   TEXT NOT NULL,
    webhook_url TEXT,
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS verified_users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    username    TEXT NOT NULL,
    avatar      TEXT,
    verified_at INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS recovery_keys (
    key              TEXT PRIMARY KEY,
    source_guild_id  TEXT NOT NULL,
    created_by       TEXT NOT NULL,
    created_at       INTEGER DEFAULT (strftime('%s','now')),
    used             INTEGER DEFAULT 0,
    used_at          INTEGER,
    used_by_guild_id TEXT
  );

  CREATE TABLE IF NOT EXISTS verify_tokens (
    token      TEXT PRIMARY KEY,
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

module.exports = db;
