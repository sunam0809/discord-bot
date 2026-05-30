import { Router } from "express";
import axios from "axios";
import { dbQueries } from "../database.js";
import { logger } from "../lib/logger.js";

const router = Router();

const DISCORD_API = "https://discord.com/api/v10";
const CLIENT_ID = process.env["DISCORD_CLIENT_ID"]!;
const CLIENT_SECRET = process.env["DISCORD_CLIENT_SECRET"]!;
const SITE_URL = (process.env["SITE_URL"] || "http://localhost:" + process.env["PORT"]).replace(/\/$/, "");

router.get("/discord", async (req, res) => {
  const guildId = req.query["guild"] as string;
  if (!guildId) return res.redirect("/error?msg=서버+ID가+없습니다");

  const config = await dbQueries.getConfig(guildId);
  if (!config) return res.redirect("/error?msg=이+서버는+인증이+설정되지+않았습니다");

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${SITE_URL}/api/auth/callback`,
    response_type: "code",
    scope: "identify guilds.join",
    state: guildId,
  });

  return res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

router.get("/callback", async (req, res) => {
  const { code, state: guildId } = req.query as { code: string; state: string };
  if (!code || !guildId) return res.redirect("/error?msg=인증에+실패했습니다");

  try {
    const tokenRes = await axios.post(
      `${DISCORD_API}/oauth2/token`,
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${SITE_URL}/api/auth/callback`,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, token_type } = tokenRes.data;

    const userRes = await axios.get(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `${token_type} ${access_token}` },
    });
    const user = userRes.data;

    await dbQueries.upsertUser(
      guildId, user.id, user.username,
      user.global_name || null, user.avatar || null, access_token
    );

    const config = await dbQueries.getConfig(guildId);

    if (config?.role_id) {
      try {
        await axios.put(
          `${DISCORD_API}/guilds/${guildId}/members/${user.id}`,
          { access_token, roles: [config.role_id] },
          {
            headers: {
              Authorization: `Bot ${process.env["DISCORD_BOT_TOKEN"]}`,
              "Content-Type": "application/json",
            },
          }
        );
      } catch {
        try {
          await axios.put(
            `${DISCORD_API}/guilds/${guildId}/members/${user.id}/roles/${config.role_id}`,
            {},
            { headers: { Authorization: `Bot ${process.env["DISCORD_BOT_TOKEN"]}` } }
          );
        } catch {}
      }
    }

    if (config?.webhook_url) {
      const displayName = user.global_name || user.username;
      const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.id) % 5}.png`;

      const kst = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).format(new Date());

      await axios.post(config.webhook_url, {
        embeds: [{
          title: "✅ 새로운 인증",
          color: 0x5865F2,
          thumbnail: { url: avatarUrl },
          fields: [
            { name: "👤 유저", value: `<@${user.id}> (${displayName})`, inline: true },
            { name: "🆔 ID", value: user.id, inline: true },
            { name: "🕐 인증 시간 (KST)", value: kst, inline: false },
          ],
          footer: { text: "Discord 복구봇 · 인증 시스템" },
          timestamp: new Date().toISOString(),
        }],
      }).catch(() => {});
    }

    return res.redirect(
      `/success?name=${encodeURIComponent(user.global_name || user.username)}&avatar=${user.avatar || ""}&id=${user.id}`
    );
  } catch (err: any) {
    logger.error({ err: err?.response?.data || err }, "OAuth callback error");
    return res.redirect("/error?msg=인증+처리+중+오류가+발생했습니다");
  }
});

export default router;
