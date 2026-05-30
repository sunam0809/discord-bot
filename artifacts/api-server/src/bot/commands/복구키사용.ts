import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import axios from "axios";

const BOT_SECRET = process.env["BOT_SECRET"];
const API_BASE = `http://localhost:${process.env["PORT"]}/api/internal`;
const DISCORD_API = "https://discord.com/api/v10";

export const data = new SlashCommandBuilder()
  .setName("복구키사용")
  .setDescription("복구키를 사용하여 인증된 유저들을 이 서버로 초대합니다")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((opt) =>
    opt
      .setName("키")
      .setDescription("복구키 (예: ABCD-1234-EF)")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const key = interaction.options.getString("키", true).trim().toUpperCase();
  const guildId = interaction.guildId!;

  let keyData: { guildId: string; users: any[] };
  try {
    const res = await axios.post(
      `${API_BASE}/recovery-keys/${key}/use`,
      {},
      { headers: { "x-bot-secret": BOT_SECRET } }
    );
    keyData = res.data;
  } catch (err: any) {
    const msg = err?.response?.data?.error || "알 수 없는 오류";
    if (msg === "Key already used") {
      return interaction.editReply("❌ 이미 사용된 복구키입니다.");
    }
    if (msg === "Key not found") {
      return interaction.editReply("❌ 유효하지 않은 복구키입니다.");
    }
    return interaction.editReply(`❌ 오류: ${msg}`);
  }

  const { users } = keyData;

  if (!users || users.length === 0) {
    return interaction.editReply("⚠️ 복구할 인증 유저가 없습니다.");
  }

  const progressEmbed = new EmbedBuilder()
    .setTitle("⏳ 복구 진행 중...")
    .setDescription(`총 **${users.length}명**을 초대하고 있습니다...`)
    .setColor(0x5865f2);

  await interaction.editReply({ embeds: [progressEmbed] });

  const config = await axios
    .get(`${API_BASE}/config/${keyData.guildId}`, {
      headers: { "x-bot-secret": BOT_SECRET },
    })
    .catch(() => null);

  const roleId = config?.data?.role_id;

  let success = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const body: any = { access_token: user.access_token };
      if (roleId) body.roles = [roleId];

      await axios.put(
        `${DISCORD_API}/guilds/${guildId}/members/${user.user_id}`,
        body,
        {
          headers: {
            Authorization: `Bot ${process.env["DISCORD_BOT_TOKEN"]}`,
            "Content-Type": "application/json",
          },
        }
      );
      success++;
    } catch {
      failed++;
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  const resultEmbed = new EmbedBuilder()
    .setTitle("✅ 복구 완료")
    .setDescription(
      `복구 작업이 완료되었습니다!\n\n` +
      `✅ 성공: **${success}명**\n` +
      `❌ 실패: **${failed}명**\n\n` +
      `> 실패한 유저는 OAuth 토큰이 만료되었거나 서버 탈퇴 처리된 경우입니다.`
    )
    .setColor(success > 0 ? 0x57f287 : 0xed4245)
    .setTimestamp();

  return interaction.editReply({ embeds: [resultEmbed] });
}
