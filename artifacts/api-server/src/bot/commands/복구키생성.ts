import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import axios from "axios";

const BOT_SECRET = process.env["BOT_SECRET"];
const API_BASE = `http://localhost:${process.env["PORT"]}/api/internal`;

export const data = new SlashCommandBuilder()
  .setName("복구키생성")
  .setDescription("이 서버의 인증 데이터를 복구하는 키를 생성합니다")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;

  let userCount = 0;
  try {
    const res = await axios.get(`${API_BASE}/users/${guildId}`, {
      headers: { "x-bot-secret": BOT_SECRET },
    });
    userCount = res.data.count;
  } catch {}

  if (userCount === 0) {
    return interaction.editReply(
      "⚠️ 아직 이 서버에서 인증한 유저가 없습니다.\n인증 후 복구키를 생성하세요."
    );
  }

  try {
    const res = await axios.post(
      `${API_BASE}/recovery-keys`,
      { guildId, createdBy: interaction.user.id },
      { headers: { "x-bot-secret": BOT_SECRET } }
    );

    const key = res.data.key as string;

    const embed = new EmbedBuilder()
      .setTitle("🔑 복구키 생성 완료")
      .setDescription(
        `복구키가 생성되었습니다. **안전한 곳에 보관하세요.**\n\n` +
        `\`\`\`\n${key}\n\`\`\`\n\n` +
        `> 📌 이 키는 **한 번만** 사용할 수 있습니다.\n` +
        `> 총 **${userCount}명**의 인증 데이터가 저장되어 있습니다.\n` +
        `> \`/복구키사용\` 명령어로 사용하세요.`
      )
      .setColor(0xfee75c)
      .setFooter({ text: "Discord 복구봇 · 이 메시지는 본인에게만 보입니다" })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    return interaction.editReply("❌ 복구키 생성 중 오류가 발생했습니다.");
  }
}
