require('dotenv').config();

const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'SITE_URL'];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error('[ERROR] 환경변수가 설정되지 않았습니다:', missing.join(', '));
  console.error('[ERROR] .env.example을 참고하여 .env 파일을 만들어주세요.');
  process.exit(1);
}

const { startBot } = require('./bot');
const { startWeb } = require('./web');

startWeb();
startBot();
