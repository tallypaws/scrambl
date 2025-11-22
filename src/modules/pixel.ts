import {
  ApplicationCommandOptionType,
  AttachmentPayload,
  Message,
  MessageFlags,
  TextBasedChannel,
} from "discord.js";
import { userMap } from "modules/link";
import {
  games,
  channelIdtoGameId,
  getArtistHints,
  getAlbumHints,
  getTrackHints,
  isPixelGame,
  pickRandom,
  pickRandomWeighedAvoidRecent,
  componentsSimple,
  getRandomItem,
  GameType,
} from "modules/gameShared";
import sharp from "sharp";
import { defineChatCommand, defineEvent } from "strife.js";
import { InvalidCommandUsageError } from "util/errors.js";
import { fm } from "util/fm.js";
import { getNextPixelSize, pixelate } from "util/images";
import { levenshteinDistance, scramble } from "util/text";
import { colors } from "common/constants";

defineChatCommand(
  {
    name: "pixel",
    description:
      "Guess the artist/album/song out of your all-time top together with your friends.",
  },
  async (interaction, options) => {
    const channel = interaction.channel;
    if (!channel) {
      throw new InvalidCommandUsageError("Channel not found.");
    }
    if (!channel.isSendable()) {
      throw new InvalidCommandUsageError(
        "Cannot send messages in this channel."
      );
    }

    const response = await interaction.deferReply({
      withResponse: true,
    });

    await startPixel(
      channel,
      async (payload) => {
        await interaction.editReply({ ...payload });
        return response.resource?.message!;
      },

      interaction.user.id,
      "album"
    );
  }
);

type payload = {
  components: ReturnType<typeof buildPixelComponents>;
  flags: MessageFlags.IsComponentsV2;
  files?: AttachmentPayload[];
};

export async function startPixel(
  channel: TextBasedChannel,
  sendMessage: (payload: payload) => Promise<Message<boolean>>,
  user: string,
  type: GameType
) {
  try {
    console.time("startPixel_total");
    console.time("startPixel_init");
    if (channelIdtoGameId[channel.id]) {
      //   throw new InvalidCommandUsageError(
      //     "A pixel game is already in this channel."
      //   );
      return sendMessage({
        components: componentsSimple(
          "A pixel game is already in this channel."
        ),
        flags: MessageFlags.IsComponentsV2,
      });
    }
    channelIdtoGameId[channel.id] = "-";
    if (!channel.isSendable()) {
      throw new InvalidCommandUsageError(
        "Cannot send messages in this channel."
      );
    }
    console.timeEnd("startPixel_init");

    console.time("startPixel_getUser");
    const fmuser = await userMap.get(user);
    console.timeEnd("startPixel_getUser");

    if (!fmuser) {
      delete channelIdtoGameId[channel.id];
      throw new InvalidCommandUsageError(
        "You need to link your Last.fm account first using /link."
      );
    }

    let answer = "";
    let hints: { random: string[]; all: string[] } = { random: [], all: [] };
    let imageUrl = "";

    console.time("startPixel_selectItem");
    const MAX_SELECT_ATTEMPTS = 10;
    const selection = await selectAndPrepareItem(
      type,
      fmuser,
      user,
      MAX_SELECT_ATTEMPTS
    );
    answer = selection.answer;
    imageUrl = selection.imageUrl;
    const by = selection.artistName;
    console.timeEnd("startPixel_selectItem");

    console.time("startPixel_getHints_and_fetchImage");
    const fetchImagePromise = fetch(imageUrl)
      .then((res) => res.arrayBuffer())
      .then((buf) => sharp(buf).resize(1080, 1080).toBuffer());
    const hintsPromise = selection.hintsPromise;
    const [fetchedBuffer, gotHints] = await Promise.all([
      fetchImagePromise,
      hintsPromise,
    ]);
    console.timeEnd("startPixel_getHints_and_fetchImage");

    hints = gotHints;
    const imageBuffer = Buffer.from(fetchedBuffer);

    const pixelateLevel = getNextPixelSize();
    let jumbled = scramble(answer).toUpperCase();
    const gameId = `pixel-${Date.now().toString()}-${Math.floor(
      Math.random() * 1000
    )}`;

    console.time("startPixel_pixelateInitial");
    const initialPixelBuffer = await pixelate(imageBuffer, pixelateLevel);
    console.timeEnd("startPixel_pixelateInitial");

    const components = buildPixelComponents(
      jumbled,
      type,
      hints,
      pixelateLevel !== 0.01,
      gameId,
      "Type your answer within 35 seconds to make a guess"
    );

    console.time("startPixel_sendMessage");
    const message = await sendMessage({
      components,
      flags: MessageFlags.IsComponentsV2,
      files: getFiles(initialPixelBuffer),
    });
    console.timeEnd("startPixel_sendMessage");

    console.time("startPixel_registerGame");
    games[gameId] = {
      answer,
      type,
      hints,
      scrambled: jumbled,
      message,
      channelId: channel.id,
      startTimestamp: Date.now(),
      imageBuffer,
      answered: false,
      pixelateLevel,
      by: by,
      color: colors.game[type],
    };
    channelIdtoGameId[channel.id] = gameId;
    console.timeEnd("startPixel_registerGame");

    setTimeout(async () => {
      const game = games[gameId];
      if (!game || !isPixelGame(game) || game.answered) return;
      game.answered = true;

      console.time("startPixel_timeout_edit");
      await Promise.all([
        game.message.edit({
          components: buildPixelComponents(
            game.scrambled,
            game.type,
            game.hints,
            //@ts-ignore
            game.pixelateLevel !== 0.01,
            null,
            `**Time's up!**\nIt was **${game.answer}**${
              game.by ? ` by ${game.by}` : ""
            }.`
          ),
          files: getFiles(imageBuffer),
        }),
        (async () => {
          console.time("startPixel_timeout_reply_files");
          await game.message.reply({
            components: [
              {
                type: 17,
                accent_color: colors.game[game.type],
                spoiler: false,
                components: [
                  {
                    type: 10,
                    content: `Nobody guessed it right. It was \`${
                      game.answer
                    }\`${game.by ? ` by ${game.by}` : ""}.`,
                  },
                  {
                    type: 1,
                    components: [
                      {
                        type: 2,
                        style: 2,
                        label: "Play Again",
                        custom_id: `game_pixel_playagain_${game.type}`,
                      },
                    ],
                  },
                ],
              },
            ],
            flags: MessageFlags.IsComponentsV2,
          });
          console.timeEnd("startPixel_timeout_reply_files");
        })(),
      ]);
      console.timeEnd("startPixel_timeout_edit");

      delete games[gameId];
      delete channelIdtoGameId[channel.id];
    }, 35_000);

    console.timeEnd("startPixel_total");
    return;
  } catch (error) {
    delete channelIdtoGameId[channel.id];
    throw error;
  }
}

function getGiveUpComponents(
  jumbled: string,
  type: string,
  hints: { random: string[]; all: string[] },
  suffix?: string,
  buttonLabel?: string
) {
  return buildPixelGiveUpComponents(jumbled, type, hints, suffix, buttonLabel);
}

defineEvent("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  const rawCustomId = interaction.customId;
  if (!rawCustomId.startsWith("game_")) return;
  if (!rawCustomId.startsWith("game_pixel")) return;
  const customId = rawCustomId.slice(5);
  const parts = customId.split("_");
  const gameId = parts.slice(0, -1).join("_");
  const action = parts[parts.length - 1];

  if (customId.startsWith("pixel_playagain_")) {
    const gameType = customId.replace("pixel_playagain_", "") as
      | "artist"
      | "album"
      | "track";
    const channel = interaction.channel;

    if (!channel) {
      throw new InvalidCommandUsageError("Channel not found.");
    }
    if (!channel.isSendable()) {
      throw new InvalidCommandUsageError(
        "Cannot send messages in this channel."
      );
    }
    await interaction.deferUpdate();
    const buttonMessage = interaction.message;

    await buttonMessage.edit({
      components: buildPlayAgainEditComponents(
        buttonMessage,
        `${interaction.user.displayName} is playing again!`
      ),
    });
    const message = await buttonMessage.reply({
      components: componentsSimple("Starting Pixel game"),
      flags: MessageFlags.IsComponentsV2,
    });
    try {
      await startPixel(
        channel,
        async (payload) => {
          message.edit({ ...payload });
          return message;
        },
        interaction.user.id,
        gameType
      );
    } catch (e) {
      message.edit({
        components: componentsSimple("Failed to start Pixel game"),
        flags: MessageFlags.IsComponentsV2,
      });
      console.error(e);
    }

    return;
  }

  const game = games[gameId];

  if (action === "playagain") {
    const channel = interaction.channel;

    if (!channel) {
      throw new InvalidCommandUsageError("Channel not found.");
    }
    if (!channel.isSendable()) {
      throw new InvalidCommandUsageError(
        "Cannot send messages in this channel."
      );
    }

    const buttonMessage = interaction.message;
    const message = await buttonMessage.reply({
      components: componentsSimple("Starting Pixel game"),
      flags: MessageFlags.IsComponentsV2,
    });
    try {
      await startPixel(
        channel,
        async (payload) => {
          message.edit({ ...payload });
          return message;
        },
        interaction.user.id,
        game?.type ?? "album"
      );
    } catch (e) {
      message.edit({
        components: componentsSimple("Failed to start Pixel game"),
        flags: MessageFlags.IsComponentsV2,
      });
      console.error(e);
    }

    await buttonMessage.edit({
      components: buildPlayAgainEditComponents(
        buttonMessage,
        `${interaction.user.displayName} is playing again!`
      ),
    });

    return;
  }
  if (!game || !isPixelGame(game)) {
    console.trace();
    return interaction.reply({
      content: "Game not found!!!.",
      flags: MessageFlags.Ephemeral,
    });
  }
  if (game.answered) return;

  if (action === "hint") {
    if (game.hints.random.length < game.hints.all.length) {
      const newHints = pickRandom(game.hints.all, 1, game.hints.random);
      game.hints.random.push(...newHints);
    }
    if (game.pixelateLevel !== 0.01) {
      game.pixelateLevel = getNextPixelSize(game.pixelateLevel);
    }
    await Promise.all([
      await game.message.edit({
        components: buildPixelComponents(
          game.scrambled,
          game.type,
          game.hints,
          game.pixelateLevel !== 0.01,
          gameId
        ),
        files: getFiles(await pixelate(game.imageBuffer, game.pixelateLevel)),
      }),
      await interaction.deferUpdate(),
    ]);
  } else if (action === "reshuffle") {
    game.scrambled = scramble(game.answer).toUpperCase();
    await Promise.all([
      await game.message.edit({
        components: buildPixelComponents(
          game.scrambled,
          game.type,
          game.hints,
          game.pixelateLevel !== 0.01,
          gameId
        ),
        files: getFiles(await pixelate(game.imageBuffer, game.pixelateLevel)),
      }),
      await interaction.deferUpdate(),
    ]);
  } else if (action === "giveup") {
    game.answered = true;
    await game.message.edit({
      components: getGiveUpComponents(
        game.scrambled,
        game.type,
        game.hints,
        `**<@${interaction.user.id}> gave up!**\nThe answer was **${game.answer}**.`
      ),
      files: getFiles(game.imageBuffer),
    });

    delete games[gameId];
    delete channelIdtoGameId[game.channelId];
  }
});

defineEvent("messageCreate", async (message) => {
  if (message.author.bot) return;
  const channelId = message.channel.id;
  const gameId = channelIdtoGameId[channelId];
  if (!gameId) return;
  const game = games[gameId];
  if (!game || !isPixelGame(game)) return;

  if (game.answered) return;

  const userGuess = message.content.trim().toLowerCase();
  if (Math.abs(userGuess.length - game.answer.length) > 5) return;
  if (levenshteinDistance(userGuess, game.answer.toLowerCase()) <= 1) {
    game.answered = true;
    await Promise.all([
      await game.message.edit({
        components: buildPixelComponents(
          game.scrambled,
          game.type,
          game.hints,
          game.pixelateLevel !== 0.01,
          null,
          `**<@${message.author.id}> guessed it!!!!!!!**`
        ),
        files: getFiles(game.imageBuffer),
        flags: MessageFlags.IsComponentsV2,
      }),
      await message.react("✅"),
      await message.reply({
        components: buildPixelAnswerComponents(
          game.answer,
          message.createdTimestamp - game.startTimestamp,
          message.author.id,
          game.type,
          game.by
        ),
        flags: MessageFlags.IsComponentsV2,
      }),
    ]);
    delete games[gameId];
    delete channelIdtoGameId[channelId];
  } else if (levenshteinDistance(userGuess, game.answer) <= 3) {
    await message.react("🤏");
  } else {
    await message.react("❌");
  }
});

function getFiles(buffer: Buffer): AttachmentPayload[] {
  return [
    {
      name: "pixelized.png",
      attachment: buffer,
    },
  ];
}

async function selectAndPrepareItem(
  type: GameType,
  fmuser: any,
  user: string,
  MAX_SELECT_ATTEMPTS: number
) {
  if (type === "artist") {
    console.time("startPixel_topArtists");
    const list = await fm.user.topArtists(fmuser.lastfm);
    console.timeEnd("startPixel_topArtists");

    console.time("startPixel_pickArtist");
    const candidates = list.topartists.artist.filter(
      (a: any) =>
        a.image &&
        a.image.find(
          (img: any) =>
            !img["#text"].includes("2a96cbd8b46e442fc41c2b86b821562f")
        )
    );

    const randomItem: any | undefined = await getRandomItem(type, fmuser, user);
    if (!randomItem) throw new Error("Could not select a valid artist");

    const answer = randomItem.name;
    const imageUrl =
      randomItem.image?.find((img: any) => img.size === "mega")?.["#text"] ??
      randomItem.image?.find((img: any) => img.size === "extralarge")?.[
        "#text"
      ] ??
      randomItem.image?.find((img: any) => img.size === "large")?.["#text"] ??
      randomItem.image?.find((img: any) => img.size === "medium")?.["#text"] ??
      randomItem.image?.[0]?.["#text"] ??
      "";

    const hintsPromise = getArtistHints(3, randomItem, +randomItem.playcount!);
    return { answer, imageUrl, randomItem, hintsPromise };
  }

  if (type === "album" || type === "track") {
    if (type === "album") console.time("startPixel_topAlbums");
    else console.time("startPixel_topTracks");

    const list =
      type === "album"
        ? await fm.user.topAlbums(fmuser.lastfm)
        : await fm.user.topTracks(fmuser.lastfm);

    if (type === "album") console.timeEnd("startPixel_topAlbums");
    else console.timeEnd("startPixel_topTracks");

    const arr =
      type === "album"
        ? (list as any).topalbums.album
        : (list as any).toptracks.track;

    console.time(
      type === "album" ? "startPixel_pickAlbum" : "startPixel_pickTrack"
    );
    const candidates = arr.filter(
      (a: any) =>
        a.image &&
        a.image.find(
          (img: any) =>
            !img["#text"].includes("2a96cbd8b46e442fc41c2b86b821562f")
        )
    );

    let randomItem: any | undefined;
    for (let attempt = 0; attempt < MAX_SELECT_ATTEMPTS; attempt++) {
      randomItem = pickRandomWeighedAvoidRecent(
        candidates,
        "playcount",
        0.6,
        user,
        type,
        (it: any) => `${it.artist?.name ?? ""}::${it.name ?? it.title ?? ""}`
      );
      if (!randomItem) continue;

      const name = randomItem.name ?? randomItem.title;
      const artistName = randomItem.artist?.name;
      const playcount = randomItem.playcount;
      const img =
        randomItem.image?.find((img: any) => img.size === "large")?.["#text"] ??
        randomItem.image?.find((img: any) => img.size === "medium")?.[
          "#text"
        ] ??
        randomItem.image?.[0]?.["#text"] ??
        "";

      if (!artistName || !name || !playcount || !img) {
        randomItem = undefined;
        continue;
      }

      randomItem._resolvedImage = img;
      break;
    }
    console.timeEnd(
      type === "album" ? "startPixel_pickAlbum" : "startPixel_pickTrack"
    );

    if (!randomItem) throw new Error(`Could not select a valid ${type}`);

    const answer = randomItem.name ?? randomItem.title;
    const imageUrl = randomItem._resolvedImage;
    const hintsPromise =
      type === "album"
        ? getAlbumHints(
            randomItem.artist.name,
            randomItem.name ?? randomItem.title,
            +randomItem.playcount
          )
        : getTrackHints(
            randomItem.artist.name,
            randomItem.name ?? randomItem.title,
            +randomItem.playcount
          );

    return {
      answer,
      imageUrl,
      randomItem,
      hintsPromise,
      artistName: randomItem.artist.name,
    };
  }

  throw new Error("Unsupported type");
}

function buildPixelComponents(
  jumbled: string | undefined,
  type: GameType,
  hints: { random: string[]; all: string[] },
  canBeUnpixeled: boolean,
  gameId: string | null,
  suffix?: string
) {
  return [
    {
      type: 17,
      accent_color: colors.game[type],
      spoiler: false,
      components: [
        {
          type: 12,
          items: [
            {
              media: {
                url: "attachment://pixelized.png",
              },
              description: null,
              spoiler: false,
            },
          ],
        },
        ...(jumbled
          ? [
              {
                type: 10,
                content: `## \`${jumbled}\``,
              },
            ]
          : []),
        {
          type: 10,
          content: `**Pixel - Guess the ${type}**${
            hints.random.length ? "\n" : ""
          }${hints.random.map((hint) => `- ${hint}`).join("\n")}
          ${suffix ? `\n\n${suffix}` : ""}`,
        },
        ...(gameId
          ? [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 2,
                    label:
                      hints.random.length < hints.all.length
                        ? "Add Hint"
                        : "Depixelate",
                    emoji: null,
                    disabled:
                      hints.random.length >= hints.all.length &&
                      !canBeUnpixeled,
                    custom_id: `game_${gameId}_hint`,
                  },
                  {
                    type: 2,
                    style: 2,
                    label: "Reshuffle",
                    emoji: null,
                    disabled: false,
                    custom_id: `game_${gameId}_reshuffle`,
                  },
                  {
                    type: 2,
                    style: 2,
                    label: "Give Up",
                    emoji: null,
                    disabled: false,
                    custom_id: `game_${gameId}_giveup`,
                  },
                ],
              },
            ]
          : []),
      ],
    },
  ];
}

function buildPixelGiveUpComponents(
  jumbled: string,
  type: string,
  hints: { random: string[]; all: string[] },
  suffix?: string,
  buttonLabel?: string
) {
  return [
    {
      type: 17,
      accent_color: colors.giveUp,
      spoiler: false,
      components: [
        {
          type: 12,
          items: [
            {
              media: {
                url: "attachment://pixelized.png",
              },
              description: null,
              spoiler: false,
            },
          ],
        },
        {
          type: 10,
          content: `## \`${jumbled}\``,
        },
        {
          type: 10,
          content: `**Pixel - Guess the ${type}**${
            hints.random.length ? "\n" : ""
          }${hints.random.map((hint) => `- ${hint}`).join("\n")}
          ${suffix ? `\n\n${suffix}` : ""}`,
        },
        ...(true
          ? [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 2,
                    label: buttonLabel || "Play Again",
                    emoji: null,
                    disabled: !!buttonLabel,
                    custom_id: "game_pixel_playagain",
                  },
                ],
              },
            ]
          : []),
      ],
    },
  ];
}

function buildPixelAnswerComponents(
  answer: string,
  timeMs: number,
  userId: string,
  gameType: GameType,
  by: string | undefined = undefined
) {
  return [
    {
      type: 17,
      accent_color: colors.correct,
      spoiler: false,
      components: [
        {
          type: 10,
          content: `<@${userId}> got it! The answer was \`${answer}\`${
            by ? ` by ${by}` : ""
          }.\nAnswered in ${Intl.NumberFormat("en-US", {
            maximumFractionDigits: 2,
          }).format(timeMs / 1000)}s.`,
        },
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 2,
              label: "Play Again",
              emoji: null,
              disabled: false,
              custom_id: `game_pixel_playagain_${gameType}`,
            },
          ],
        },
      ],
    },
  ];
}

function buildPlayAgainEditComponents(buttonMessage: any, label: string) {
  const components = buttonMessage.components[0].components;
  components.pop();
  return [
    {
      type: 17,
      accent_color:
        buttonMessage.components[0].data.accent_color ?? colors.startUp,
      spoiler: false,
      components: [
        ...components,
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 2,
              label: label,
              disabled: true,
              custom_id: "game_pixel_playagain_album",
            },
          ],
        },
      ],
    },
  ];
}
