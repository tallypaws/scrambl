import { DBMap } from "common/database";
import {
  ApplicationCommandOptionType,
  ComponentType,
  MessageFlags,
} from "discord.js";
import { defineChatCommand, defineEvent } from "strife.js";
import fm from "util/fm";
import z from "zod";

const schema = z.object({
  lastfm: z.string(),
});
export const userMap = new DBMap("fmusermap", schema, null);

const confirmPromises: Record<string, (value: string) => void> = {};

defineChatCommand(
  {
    name: "link",
    description: "link a last.fm account to use",
    options: {
      username: {
        type: ApplicationCommandOptionType.String,
        description: "Your last.fm account username",
        required: true,
      },
    },
  },
  async (interaction, options) => {
    await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
    });
    try {
      await fm.user.topArtists(options.username);
    } catch (error) {
      if (error instanceof Response) {
        if (error.status === 404) {
          return await interaction.editReply({
            components: [
              {
                type: 17,
                accent_color: null,
                spoiler: false,
                components: [
                  {
                    type: 10,
                    content: "That USER DOES NOT EXIST!!!!!!!!!",
                  },
                ],
              },
            ],
            flags: MessageFlags.IsComponentsV2,
          });
        }
      }
    }
    const existing = await userMap.get(interaction.user.id);
    if (existing) {
      let resolve!: (value: string) => void;

      const promise = new Promise<string>((r) => {
        resolve = r;
      });
      confirmPromises[interaction.id] = resolve;
      await interaction.editReply({
        components: [
          {
            type: 17,
            accent_color: null,
            spoiler: false,
            components: [
              {
                type: 10,
                content:
                  "your discord is already linked to `" +
                  existing.lastfm +
                  "`. do you wannar overwrite it?!",
              },
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 2,
                    label: "Yes",
                    custom_id: `linkconfirm_${interaction.id}_yes`,
                  },
                  {
                    type: 2,
                    style: 2,
                    label: "No",
                    custom_id: `linkconfirm_${interaction.id}_no`,
                  },
                ],
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      setTimeout(() => {
        resolve("timeout");
      }, 60000);
      const answer = await promise;
      delete confirmPromises[interaction.id]; // extra cursed

      if (answer === "no") {
        return await interaction.editReply({
          components: [
            {
              type: 17,
              accent_color: null,
              spoiler: false,
              components: [
                {
                  type: 10,
                  content: "ok",
                },
              ],
            },
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      } else if (answer === "timeout") {
        return await interaction.editReply({
          components: [
            {
              type: 17,
              accent_color: null,
              spoiler: false,
              components: [
                {
                  type: 10,
                  content: "vro u took too long",
                },
              ],
            },
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    }
    await userMap.set(interaction.user.id, { lastfm: options.username });
    await interaction.editReply({
      components: [
        {
          type: 17,
          accent_color: null,
          spoiler: false,
          components: [
            {
              type: 10,
              content:
                "checkamrk your discord has been linked to `" +
                options.username +
                "`",
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  }
);

defineEvent("interactionCreate", (btn) => {
  if (!btn.isButton()) return;
  const [type, id, option] = btn.customId.split("_");
  if (!type || !id || !option) return;
  if (type !== "linkconfirm") return;

  const resolve = confirmPromises[id];
  if (!resolve) return;
  resolve(option);
});
