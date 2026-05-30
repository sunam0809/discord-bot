import { Router } from "express";
import { randomBytes } from "node:crypto";
import { dbQueries } from "../database.js";
import { logger } from "../lib/logger.js";

const router = Router();

const BOT_SECRET = process.env["BOT_SECRET"];

router.use((req, res, next) => {
  const auth = req.headers["x-bot-secret"];
  if (!BOT_SECRET || auth !== BOT_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

router.post("/config", async (req, res) => {
  const { guildId, roleId, webhookUrl } = req.body as {
    guildId: string;
    roleId?: string;
    webhookUrl?: string;
  };
  if (!guildId) return res.status(400).json({ error: "guildId required" });

  await dbQueries.upsertConfig(guildId, roleId || null, webhookUrl || null);
  logger.info({ guildId, roleId, webhookUrl }, "Guild config updated");
  return res.json({ ok: true });
});

router.get("/config/:guildId", async (req, res) => {
  const config = await dbQueries.getConfig(req.params["guildId"]!);
  if (!config) return res.status(404).json({ error: "Not found" });
  return res.json(config);
});

router.get("/users/:guildId", async (req, res) => {
  const users = await dbQueries.getUsersByGuild(req.params["guildId"]!);
  const count = await dbQueries.getUserCount(req.params["guildId"]!);
  return res.json({ users, count });
});

router.post("/recovery-keys", async (req, res) => {
  const { guildId, createdBy } = req.body as { guildId: string; createdBy: string };
  if (!guildId || !createdBy) return res.status(400).json({ error: "guildId and createdBy required" });

  const part1 = randomBytes(2).toString("hex").toUpperCase();
  const part2 = randomBytes(2).toString("hex").toUpperCase();
  const part3 = randomBytes(2).toString("hex").toUpperCase();
  const fullKey = `${part1}-${part2}-${part3}`;

  await dbQueries.createRecoveryKey(fullKey, guildId, createdBy);
  logger.info({ guildId, createdBy, key: fullKey }, "Recovery key created");
  return res.json({ key: fullKey });
});

router.post("/recovery-keys/:key/use", async (req, res) => {
  const key = req.params["key"]!;
  const keyData = await dbQueries.getRecoveryKey(key);

  if (!keyData) return res.status(404).json({ error: "Key not found" });
  if (keyData.used) return res.status(400).json({ error: "Key already used" });

  const users = await dbQueries.getUsersByGuild(keyData.guild_id);
  await dbQueries.markKeyUsed(key);

  logger.info({ key, guildId: keyData.guild_id, userCount: users.length }, "Recovery key used");
  return res.json({ ok: true, guildId: keyData.guild_id, users });
});

export default router;
