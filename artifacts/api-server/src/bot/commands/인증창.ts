import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import axios from "axios";

const SITE_URL = process.env["SITE_URL"] || "http://localhost:" + process.env["PORT"];
const BOT_SECRET = process.env["BOT_SECRET"];
const API_BASE = `http://localhost:${process.env["PORT"]}/api/internal`;

export const data = new SlashCommandBuilder()
  .setName("인증창")
  .setDescription("인증 패널을 설정하고 채팅에 전송합니다")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addRoleOption((opt) =>
    opt.setName("역할").setDescription("인증 후 부여할 역할").setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("웹훅")
      .setDescription("인증 로그를 보낼 웹훅 URL")
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const role = interaction.options.getRole("역할", true);
  const webhookUrl = interaction.options.getString("웹훅") || null;
  const guildId = interaction.guildId!;

  try {
    await axios.post(
      `${API_BASE}/config`,
      { guildId, roleId: role.id, webhookUrl },
      { headers: { "x-bot-secret": BOT_SECRET } }
    );
  } catch (err) {
    return interaction.editReply("❌ 서버 설정 저장 중 오류가 발생했습니다.");
  }

  const authUrl = `${SITE_URL}?guild=${guildId}`;

  const embed = new EmbedBuilder()
    .setTitle("🛡️ 서버 인증")
    .setDescription(
      `이 서버를 이용하려면 아래 버튼을 눌러 인증을 완료하세요.\n\n` +
      `인증 후 <@&${role.id}> 역할이 자동으로 부여됩니다.\n\n` +
      `> ✅ 인증 버튼을 누르면 Discord 로그인 화면이 열립니다.`
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Discord 복구봇 · 인증 시스템" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("인증하기")
      .setStyle(ButtonStyle.Link)
      .setURL(authUrl)
      .setEmoji("✅")
  );

  await interaction.channel!.send({ embeds: [embed], components: [row] });

  const webhookText = webhookUrl
    ? `웹훅: 설정됨 ✅`
    : `웹훅: 미설정 (선택사항)`;

  await interaction.editReply(
    `✅ 인증 패널이 전송되었습니다!\n역할: <@&${role.id}>\n${webhookText}`
  );
}
