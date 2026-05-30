import {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
} from "discord.js";
import { logger } from "../lib/logger.js";
import * as 인증창Command from "./commands/인증창.js";
import * as 복구키생성Command from "./commands/복구키생성.js";
import * as 복구키사용Command from "./commands/복구키사용.js";

type Command = {
  data: { name: string; toJSON: () => object };
  execute: (interaction: any) => Promise<void>;
};

const commands: Command[] = [
  인증창Command,
  복구키생성Command,
  복구키사용Command,
];

const commandMap = new Collection<string, Command>();
for (const cmd of commands) {
  commandMap.set(cmd.data.name, cmd);
}

export async function startBot() {
  const token = process.env["DISCORD_BOT_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];

  if (!token || !clientId) {
    logger.warn("DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID not set, bot will not start");
    return;
  }

  const rest = new REST().setToken(token);
  try {
    await rest.put(Routes.applicationCommands(clientId), {
      body: commands.map((cmd) => cmd.data.toJSON()),
    });
    logger.info("Discord slash commands registered");
  } catch (err) {
    logger.error({ err }, "Failed to register slash commands");
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.on("ready", () => {
    logger.info({ tag: client.user?.tag }, "Discord bot is online");
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error({ err, command: interaction.commandName }, "Command error");
      const reply = {
        content: "❌ 명령어 실행 중 오류가 발생했습니다.",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(reply.content);
      } else {
        await interaction.reply(reply);
      }
    }
  });

  await client.login(token);
}
