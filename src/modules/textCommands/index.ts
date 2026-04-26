import { Message, MessageFlags } from "discord.js";
import { commands } from "./cmds.js";
import { client, defineEvent } from "strife.js";
import { InvalidCommandUsageError } from "../../util/errors.js";
import { DBMap } from "../../common/database.js";
import z from "zod";

export interface CommandContext {
  message: Message;
  args: string[];
}

export interface CommandDef {
  name: string;
  aliases?: string[];
  run(ctx: CommandContext): Promise<any>;
}

const DefaultPrefix = "s.";

export const guildPrefixMap = await DBMap.create({
  name: "fmusermap",
  schema: z.string(),
  defaultV: DefaultPrefix,
});

const commandMap = new Map<string, CommandDef>();

for (const cmd of commands) {
  commandMap.set(cmd.name, cmd);
  if (cmd.aliases) {
    for (const a of cmd.aliases) {
      commandMap.set(a, cmd);
    }
  }
}
defineEvent("messageCreate", async (message) => {
  if (message.author.bot) return;

  const raw = message.content.trim();
  const prefix = message.guild
    ? await guildPrefixMap.get(message.guild.id)
    : DefaultPrefix;

  const botMention = `<@${client.user.id}>`;

  if (!(raw.startsWith(prefix) || raw.startsWith(botMention))) return;

  let withoutPrefix: string;
  if (raw.startsWith(botMention)) {
    withoutPrefix = raw.slice(botMention.length);
  } else {
    withoutPrefix = raw.slice(prefix.length);
  }
  withoutPrefix = withoutPrefix.trimStart();

  if (raw.startsWith(botMention) && withoutPrefix.length === 0) {
    return message.reply({
      content: `This server's prefix is \`${prefix}\``,
    });
  }

  const parts = withoutPrefix.split(/\s+/);
  const cmdName = parts.shift()?.toLowerCase();
  const args = parts;

  if (!cmdName) return;

  const command = commandMap.get(cmdName);
  if (!command) return;

  try {
    await command.run({ message, args });
  } catch (err) {
    if (err instanceof InvalidCommandUsageError) {
      return void message.reply({
        content: `Invalid command usage: ${err.message}`,
      });
    }
    console.error("Command error:", err);
  }
});
