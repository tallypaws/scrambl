import {
  MessageCreateOptions,
  MessagePayload,
  PermissionFlagsBits,
} from "discord.js";
import { InvalidCommandUsageError } from "../../util/errors.js";
import { startJumble } from "../jumble.js";
import { CommandDef, guildPrefixMap } from "./index.js";

export const commands: CommandDef[] = [
  {
    name: "jumble",
    aliases: ["j", "jumb"],
    async run({ message, args }) {
      const channel = message.channel;
      if (!channel.isSendable()) {
        return;
      }

      const type = args[0] ?? ("artist" as "artist" | "album" | "track");
      if (type !== "artist" && type !== "album" && type !== "track") {
        throw new InvalidCommandUsageError(
          'Invalid jumble type. Please specify "artist", "album", or "track".',
        );
      }
      await startJumble(
        channel,
        async (payload) => {
          const msg = await message
            .reply(payload)
            .catch(async () => channel.send(payload));

          return msg;
        },
        message.author.id,
        type,
      );
    },
  },
  {
    name: "setprefix",
    aliases: ["sp", "prefix", "pre", "pref"],
    async run({ message, args }) {
      const prefix = args[0];
      const author = message.author;
      const guild = message.guild;
      if (!guild) {
        throw new InvalidCommandUsageError("This command is only for servers.");
      }

      const guildMember = await guild.members.fetch(author.id).catch((e) => {
        console.error(e);
        return null;
      });

      if (!guildMember) {
        throw new InvalidCommandUsageError("Internal error.");
      }

      if (!guildMember.permissions.has(PermissionFlagsBits.ManageGuild)) {
        throw new InvalidCommandUsageError(
          "Invalid usage. You must have the `ManageGuild` permission.",
        );
      }

      if (!prefix || prefix.length < 1) {
        throw new InvalidCommandUsageError(
          "Invalid prefix. Prefix length must be at least 1.",
        );
      }
      if (prefix.length > 32) {
        throw new InvalidCommandUsageError(
          "Invalid prefix. Prefix length must be at most 32. (why the heck are you doing this)",
        );
      }
      if (!/^[a-zA-Z0-9]+$/.test(prefix)) {
        throw new InvalidCommandUsageError(
          "Invalid prefix. Prefix must only contain alphanumeric characters.",
        );
      }

      await guildPrefixMap.set(guild.id, prefix);

      const payload: MessageCreateOptions = {
        content: `Successfully set bot prefix to \`${prefix}\``,
        allowedMentions: { parse: [] },
      };

      await message
        .reply(payload)
        .catch(async () =>
          message.channel.isSendable() ? message.channel.send(payload) : false,
        );
    },
  },
];
