import { ActivityType, GatewayIntentBits } from "discord.js";
import login, { client } from "strife.js";
import { fileURLToPath } from "url";

function toBitmap(a: number[]): number;
function toBitmap(a: number, b: number): number;
function toBitmap(a: number | number[], b?: number): number {
  if (Array.isArray(a)) {
    return a.reduce(toBitmap, 0);
  }
  return a | (b ?? 0);
}
await login({
  handleError: (err) => {
    console.error("❌ An error occurred:", err);
  },
  clientOptions: {
    intents: toBitmap([
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessageReactions,
    ]),
    // partials: [Partials.Message, Partials.Reaction],
    presence: {
      status: "dnd",
      activities: [{ name: "Bootin up...", type: ActivityType.Custom }],
    },
  },

  modulesDirectory: fileURLToPath(new URL("./modules", import.meta.url)),
});

client.user.setStatus("online");
client.user.setActivity("oh damn im scrambled", { type: ActivityType.Custom });