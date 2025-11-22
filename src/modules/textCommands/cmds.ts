import { InvalidCommandUsageError } from "util/errors.js";
import { startJumble } from "../jumble.js";
import { CommandDef } from "./index.js";

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
          'Invalid jumble type. Please specify "artist", "album", or "track".'
        );
      }
      await startJumble(
        channel,
        async (payload) => {
          const msg = await channel.send(payload);
          
          return msg;
        },
        message.author.id,
        type
      );
    },
  },
];
