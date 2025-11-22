import { Message, MessageFlags } from "discord.js";
import { commands } from "./cmds";
import { defineEvent } from "strife.js";
import { InvalidCommandUsageError } from "util/errors";

export interface CommandContext {
  message: Message;
  args: string[];
}

export interface CommandDef {
  name: string;
  aliases?: string[];
  run(ctx: CommandContext): Promise<any>;
}

const PREFIX = ".";

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
  if (!raw.startsWith(PREFIX)) return;

  const withoutPrefix = raw.slice(PREFIX.length);
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
