import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  ssl: process.env["DATABASE_URL"]?.includes("neon.tech") || process.env["NODE_ENV"] === "production"
    ? { rejectUnauthorized: false }
    : false,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_configs (
      guild_id TEXT PRIMARY KEY,
      role_id TEXT,
      webhook_url TEXT,
      updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS authenticated_users (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      global_name TEXT,
      avatar TEXT,
      access_token TEXT NOT NULL,
      authenticated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      UNIQUE(guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS recovery_keys (
      key TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      used_at BIGINT
    );
  `);
}

export type GuildConfig = {
  guild_id: string;
  role_id: string | null;
  webhook_url: string | null;
  updated_at: number;
};

export type AuthenticatedUser = {
  id: number;
  guild_id: string;
  user_id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  access_token: string;
  authenticated_at: number;
};

export type RecoveryKey = {
  key: string;
  guild_id: string;
  created_by: string;
  created_at: number;
  used: boolean;
  used_at: number | null;
};

export const dbQueries = {
  async getConfig(guildId: string): Promise<GuildConfig | undefined> {
    const res = await pool.query<GuildConfig>(
      "SELECT * FROM guild_configs WHERE guild_id = $1",
      [guildId]
    );
    return res.rows[0];
  },

  async upsertConfig(guildId: string, roleId: string | null, webhookUrl: string | null) {
    await pool.query(
      `INSERT INTO guild_configs (guild_id, role_id, webhook_url, updated_at)
       VALUES ($1, $2, $3, EXTRACT(EPOCH FROM NOW())::BIGINT)
       ON CONFLICT (guild_id) DO UPDATE SET
         role_id = EXCLUDED.role_id,
         webhook_url = EXCLUDED.webhook_url,
         updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT`,
      [guildId, roleId, webhookUrl]
    );
  },

  async upsertUser(
    guildId: string, userId: string, username: string,
    globalName: string | null, avatar: string | null, accessToken: string
  ) {
    await pool.query(
      `INSERT INTO authenticated_users (guild_id, user_id, username, global_name, avatar, access_token, authenticated_at)
       VALUES ($1, $2, $3, $4, $5, $6, EXTRACT(EPOCH FROM NOW())::BIGINT)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET
         username = EXCLUDED.username,
         global_name = EXCLUDED.global_name,
         avatar = EXCLUDED.avatar,
         access_token = EXCLUDED.access_token,
         authenticated_at = EXTRACT(EPOCH FROM NOW())::BIGINT`,
      [guildId, userId, username, globalName, avatar, accessToken]
    );
  },

  async getUsersByGuild(guildId: string): Promise<AuthenticatedUser[]> {
    const res = await pool.query<AuthenticatedUser>(
      "SELECT * FROM authenticated_users WHERE guild_id = $1 ORDER BY authenticated_at DESC",
      [guildId]
    );
    return res.rows;
  },

  async getUserCount(guildId: string): Promise<number> {
    const res = await pool.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM authenticated_users WHERE guild_id = $1",
      [guildId]
    );
    return parseInt(res.rows[0]?.count ?? "0");
  },

  async createRecoveryKey(key: string, guildId: string, createdBy: string) {
    await pool.query(
      "INSERT INTO recovery_keys (key, guild_id, created_by) VALUES ($1, $2, $3)",
      [key, guildId, createdBy]
    );
  },

  async getRecoveryKey(key: string): Promise<RecoveryKey | undefined> {
    const res = await pool.query<RecoveryKey>(
      "SELECT * FROM recovery_keys WHERE key = $1",
      [key]
    );
    return res.rows[0];
  },

  async markKeyUsed(key: string) {
    await pool.query(
      "UPDATE recovery_keys SET used = TRUE, used_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE key = $1",
      [key]
    );
  },
};

export { init };
export default pool;
