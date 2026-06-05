# Discord 인증 & 복구 봇

사이버틱한 디자인의 Discord 서버 인증 및 복구 시스템

## 기능

- `/인증창` — 채널에 인증 패널 생성 (역할, 웹훅 URL 설정)
- `/복구키만들기` — 서버 복구용 1회용 키 생성
- `/복구키사용` — 복구키로 인증된 유저를 새 서버로 초대

> 모든 명령어는 특정 유저 ID만 사용 가능

## Render 배포

1. 이 저장소를 Render에 연결
2. 환경변수 설정:
   - `DISCORD_TOKEN` — 봇 토큰
   - `DISCORD_CLIENT_ID` — 앱 클라이언트 ID
   - `DISCORD_CLIENT_SECRET` — 앱 클라이언트 시크릿
   - `SITE_URL` — Render에서 발급된 URL (예: `https://discord-recovery-bot.onrender.com`)
3. Persistent Disk 활성화 (데이터 유지용, `/data` 마운트)
4. Discord Developer Portal에서 OAuth2 리디렉트 URI 추가:
   - `https://YOUR-APP.onrender.com/auth/callback`

## Discord 봇 설정

1. [Discord Developer Portal](https://discord.com/developers/applications)에서 앱 생성
2. Bot 탭 → 토큰 복사 → `DISCORD_TOKEN`
3. OAuth2 탭 → Client ID, Secret 복사
4. Bot 권한: `Manage Roles`, `Create Invites`, `Send Messages`, `Use Slash Commands`
5. Bot을 서버에 초대할 때 위 권한 포함

## 로컬 개발

```bash
cp .env.example .env
# .env 파일 수정 후:
npm install
npm start
```
