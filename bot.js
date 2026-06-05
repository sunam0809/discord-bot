const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  InteractionType,
} = require('discord.js');
const { randomUUID } = require('crypto');
const db = require('./db');

const OWNER_ID = '1368030640628301865';
const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

const commands = [
  new SlashCommandBuilder()
    .setName('인증창')
    .setDescription('이 채널에 인증 패널을 생성합니다.')
    .addRoleOption(opt =>
      opt.setName('역할').setDescription('인증 시 부여할 역할').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('웹훅').setDescription('인증 로그를 받을 웹훅 URL').setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('복구키만들기')
    .setDescription('이 서버의 인증 유저를 복구하는 1회용 키를 생성합니다.')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('복구키사용')
    .setDescription('복구키를 사용해 인증된 유저들을 이 서버로 초대합니다.')
    .addStringOption(opt =>
      opt.setName('키').setDescription('복구 키').setRequired(true)
    )
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
    body: commands,
  });
  console.log('[Bot] 슬래시 커맨드 등록 완료');
}

function isOwner(userId) {
  return userId === OWNER_ID;
}

async function handleVerifyPanel(interaction) {
  if (!isOwner(interaction.user.id)) {
    return interaction.reply({ content: '❌ 이 명령어를 사용할 권한이 없습니다.', ephemeral: true });
  }

  const role = interaction.options.getRole('역할');
  const webhookUrl = interaction.options.getString('웹훅') || null;
  const guildId = interaction.guildId;

  db.prepare(`
    INSERT INTO guild_configs (guild_id, role_id, webhook_url)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET role_id=excluded.role_id, webhook_url=excluded.webhook_url, updated_at=strftime('%s','now')
  `).run(guildId, role.id, webhookUrl);

  const embed = new EmbedBuilder()
    .setTitle('🔐 서버 인증')
    .setDescription(
      '> 이 서버에 접근하려면 인증이 필요합니다.\n\n' +
      '아래 버튼을 클릭하여 Discord 계정으로 인증을 완료하세요.\n\n' +
      '✅ 인증 완료 시 **' + role.name + '** 역할이 자동으로 부여됩니다.'
    )
    .setColor(0x0099ff)
    .setFooter({ text: '인증 후 서버의 모든 채널에 접근할 수 있습니다.' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify_start')
      .setLabel('인증하기')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔒')
  );

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: '✅ 인증 패널이 생성되었습니다!', ephemeral: true });
}

async function handleMakeRecoveryKey(interaction) {
  if (!isOwner(interaction.user.id)) {
    return interaction.reply({ content: '❌ 이 명령어를 사용할 권한이 없습니다.', ephemeral: true });
  }

  const guildId = interaction.guildId;
  const key = randomUUID().replace(/-/g, '').substring(0, 16).toUpperCase();

  db.prepare(
    `INSERT INTO recovery_keys (key, source_guild_id, created_by) VALUES (?, ?, ?)`
  ).run(key, guildId, interaction.user.id);

  const count = db.prepare('SELECT COUNT(*) as c FROM verified_users WHERE guild_id=?').get(guildId);

  const embed = new EmbedBuilder()
    .setTitle('🗝️ 복구 키 생성 완료')
    .setDescription(
      '**복구 키가 생성되었습니다.**\n\n' +
      '```\n' + key + '\n```\n\n' +
      '⚠️ 이 키는 **1회용**입니다. 안전한 곳에 보관하세요.\n' +
      '📊 복구 가능한 인증 유저: **' + count.c + '명**\n\n' +
      '새 서버에서 `/복구키사용 키:' + key + '` 명령어를 사용하세요.'
    )
    .setColor(0x00ff88)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleUseRecoveryKey(interaction) {
  if (!isOwner(interaction.user.id)) {
    return interaction.reply({ content: '❌ 이 명령어를 사용할 권한이 없습니다.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const key = interaction.options.getString('키').trim().toUpperCase();
  const targetGuildId = interaction.guildId;

  const keyRow = db.prepare('SELECT * FROM recovery_keys WHERE key=?').get(key);
  if (!keyRow) {
    return interaction.editReply('❌ 유효하지 않은 복구 키입니다.');
  }
  if (keyRow.used) {
    return interaction.editReply('❌ 이미 사용된 복구 키입니다.');
  }

  const users = db.prepare('SELECT * FROM verified_users WHERE guild_id=?').all(keyRow.source_guild_id);
  if (users.length === 0) {
    return interaction.editReply('❌ 복구할 인증 유저가 없습니다.');
  }

  let invite;
  try {
    invite = await interaction.channel.createInvite({ maxAge: 86400, maxUses: 0, unique: true });
  } catch {
    return interaction.editReply('❌ 서버 초대링크를 생성할 수 없습니다. 봇에게 초대 생성 권한이 있는지 확인하세요.');
  }

  db.prepare(
    `UPDATE recovery_keys SET used=1, used_at=strftime('%s','now'), used_by_guild_id=? WHERE key=?`
  ).run(targetGuildId, key);

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const member = await interaction.client.users.fetch(user.user_id);
      await member.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('📨 서버 복구 초대')
            .setDescription(
              '안녕하세요! 이전에 인증하신 서버가 이전되었습니다.\n\n' +
              '아래 링크를 통해 새 서버에 참가하세요:\n\n' +
              '🔗 **' + invite.url + '**\n\n' +
              '이 초대링크는 24시간 동안 유효합니다.'
            )
            .setColor(0x0099ff)
            .setTimestamp()
        ]
      });
      sent++;
    } catch {
      failed++;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ 복구 완료')
    .setDescription(
      `총 **${users.length}명** 중\n` +
      `✅ 초대 전송 성공: **${sent}명**\n` +
      `❌ 전송 실패 (DM 차단 등): **${failed}명**`
    )
    .setColor(0x00ff88)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleVerifyButton(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  const config = db.prepare('SELECT * FROM guild_configs WHERE guild_id=?').get(guildId);
  if (!config) {
    return interaction.reply({ content: '❌ 이 서버의 인증 설정이 없습니다. 관리자에게 문의하세요.', ephemeral: true });
  }

  const already = db.prepare('SELECT * FROM verified_users WHERE guild_id=? AND user_id=?').get(guildId, userId);
  if (already) {
    return interaction.reply({ content: '✅ 이미 인증된 계정입니다!', ephemeral: true });
  }

  const token = randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 600;
  db.prepare(
    `INSERT OR REPLACE INTO verify_tokens (token, guild_id, user_id, expires_at) VALUES (?, ?, ?, ?)`
  ).run(token, guildId, userId, expiresAt);

  const url = `${SITE_URL}/verify?token=${token}`;

  await interaction.reply({
    content: `🔗 아래 링크를 클릭하여 인증을 완료하세요 (10분 유효):\n${url}`,
    ephemeral: true,
  });
}

function startBot() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.once('ready', async () => {
    console.log(`[Bot] ${client.user.tag} 로그인 완료`);
    await registerCommands().catch(console.error);
  });

  client.on('interactionCreate', async interaction => {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === '인증창') return handleVerifyPanel(interaction);
        if (interaction.commandName === '복구키만들기') return handleMakeRecoveryKey(interaction);
        if (interaction.commandName === '복구키사용') return handleUseRecoveryKey(interaction);
      }
      if (interaction.isButton() && interaction.customId === 'verify_start') {
        return handleVerifyButton(interaction);
      }
    } catch (err) {
      console.error('[Bot] 인터랙션 오류:', err);
    }
  });

  client.login(process.env.DISCORD_TOKEN);
  return client;
}

module.exports = { startBot };
