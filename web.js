const express = require('express');
const path = require('path');
const axios = require('axios');
const { randomUUID } = require('crypto');
const db = require('./db');

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const BOT_TOKEN = process.env.DISCORD_TOKEN;
const REDIRECT_URI = `${SITE_URL}/auth/callback`;

function startWeb() {
  const app = express();
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.json());

  // 인증 페이지 — 토큰 검증 후 서버 정보 포함해서 페이지 제공
  app.get('/verify', (req, res) => {
    const { token } = req.query;
    if (!token) return res.redirect('/error.html?msg=토큰이+없습니다');

    const now = Math.floor(Date.now() / 1000);
    const row = db.prepare('SELECT * FROM verify_tokens WHERE token=?').get(token);
    if (!row) return res.redirect('/error.html?msg=유효하지+않은+토큰입니다');
    if (row.expires_at < now) {
      db.prepare('DELETE FROM verify_tokens WHERE token=?').run(token);
      return res.redirect('/error.html?msg=토큰이+만료되었습니다+다시+시도하세요');
    }

    res.sendFile(path.join(__dirname, 'public', 'verify.html'));
  });

  // OAuth2 시작
  app.get('/auth/start', (req, res) => {
    const { token } = req.query;
    if (!token) return res.redirect('/error.html?msg=토큰이+없습니다');

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'identify',
      state: token,
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });

  // OAuth2 콜백
  app.get('/auth/callback', async (req, res) => {
    const { code, state: token } = req.query;
    if (!code || !token) return res.redirect('/error.html?msg=인증에+실패했습니다');

    try {
      const now = Math.floor(Date.now() / 1000);
      const tokenRow = db.prepare('SELECT * FROM verify_tokens WHERE token=?').get(token);
      if (!tokenRow || tokenRow.expires_at < now) {
        return res.redirect('/error.html?msg=토큰이+만료되었습니다');
      }

      // access token 교환
      const tokenRes = await axios.post(
        'https://discord.com/api/oauth2/token',
        new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      const accessToken = tokenRes.data.access_token;

      // 유저 정보 조회
      const userRes = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const discordUser = userRes.data;

      // 버튼 클릭한 사람과 OAuth2 한 사람이 같은지 확인
      if (discordUser.id !== tokenRow.user_id) {
        return res.redirect('/error.html?msg=다른+계정으로+인증할+수+없습니다');
      }

      const { guild_id: guildId, user_id: userId } = tokenRow;
      const config = db.prepare('SELECT * FROM guild_configs WHERE guild_id=?').get(guildId);
      if (!config) return res.redirect('/error.html?msg=서버+설정을+찾을+수+없습니다');

      // 역할 부여
      try {
        await axios.put(
          `https://discord.com/api/guilds/${guildId}/members/${userId}/roles/${config.role_id}`,
          {},
          { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
        );
      } catch (e) {
        console.error('[Web] 역할 부여 실패:', e?.response?.data || e.message);
      }

      // DB 저장
      const username = discordUser.username + (discordUser.discriminator && discordUser.discriminator !== '0' ? '#' + discordUser.discriminator : '');
      db.prepare(`
        INSERT OR REPLACE INTO verified_users (guild_id, user_id, username, avatar)
        VALUES (?, ?, ?, ?)
      `).run(guildId, userId, username, discordUser.avatar || null);

      // 토큰 삭제
      db.prepare('DELETE FROM verify_tokens WHERE token=?').run(token);

      // 웹훅 로그 전송
      if (config.webhook_url) {
        const avatarUrl = discordUser.avatar
          ? `https://cdn.discordapp.com/avatars/${userId}/${discordUser.avatar}.png`
          : `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`;

        axios.post(config.webhook_url, {
          embeds: [{
            title: '✅ 새 인증 완료',
            description: `**유저:** ${username}\n**ID:** ${userId}\n**서버:** ${guildId}`,
            color: 0x00ff88,
            thumbnail: { url: avatarUrl },
            timestamp: new Date().toISOString(),
          }],
        }).catch(() => {});
      }

      res.redirect(`/success.html?user=${encodeURIComponent(username)}`);
    } catch (err) {
      console.error('[Web] OAuth2 콜백 오류:', err?.response?.data || err.message);
      res.redirect('/error.html?msg=인증+처리+중+오류가+발생했습니다');
    }
  });

  // 서버 정보 API (verify.html에서 사용)
  app.get('/api/verify-info', (req, res) => {
    const { token } = req.query;
    if (!token) return res.json({ error: '토큰 없음' });

    const now = Math.floor(Date.now() / 1000);
    const row = db.prepare('SELECT * FROM verify_tokens WHERE token=?').get(token);
    if (!row || row.expires_at < now) return res.json({ error: '만료됨' });

    res.json({ guildId: row.guild_id, userId: row.user_id });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[Web] 서버 시작: http://localhost:${PORT}`);
  });
}

module.exports = { startWeb };
