import {
  ApplicationCommandOptionType,
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
  pickRandom,
  pickRandomWeighedAvoidRecent,
  isPixelGame,
  getRandomItem,
  GameType,
  canStartGameInChannel,
} from "modules/gameShared";
import { defineChatCommand, defineEvent } from "strife.js";
import { InvalidCommandUsageError } from "util/errors.js";
import { levenshteinDistance, scramble } from "util/text";
import { colors } from "common/constants";

defineChatCommand(
  {
    name: "jumble",
    description:
      "Guess the artist/album/song out of your all-time top together with your friends.",
    options: {
      type: {
        type: ApplicationCommandOptionType.String,
        description: "Type of jumble game (artist, album, or track).",
        choices: {
          artist: "Artist",
          album: "Album",
          track: "Track",
          mix: "Mix (random)",
        },
      },
    },
  },
  async (interaction, options) => {
    const type = options.type ?? "artist";
    const channel = interaction.channel;
    if (!channel) {
      // return interaction.reply({ content: "Channel not found.", flags: MessageFlags.Ephemeral });
      throw new InvalidCommandUsageError("Channel not found.");
    }
    if (!channel.isSendable()) {
      // return interaction.reply({ content: "Cannot send messages in this channel.", flags: MessageFlags.Ephemeral });
      throw new InvalidCommandUsageError(
        "Cannot send messages in this channel."
      );
    }

    if (!canStartGameInChannel(channel.id)) {
      return interaction.reply({
        content: "A jumble game is already in this channel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await startJumble(
      channel,
      async (payload) => {
        const response = await interaction.reply({
          ...payload,
          withResponse: true,
        });
        return response.resource?.message!;
      },

      interaction.user.id,
      type
    );
  }
);

defineEvent("messageCreate", async (message) => {
  if (message.author.bot) return;
  const channelId = message.channel.id;
  if (message.content.toLowerCase() === ".jumble") {
    const channel = message.channel;

    if (!channel.isSendable()) {
      throw new InvalidCommandUsageError(
        "Cannot send messages in this channel."
      );
    }

    if (!canStartGameInChannel(channel.id)) {
      return;
    }
    await startJumble(
      channel,
      async (payload) => {
        const msg = await channel.send({ ...payload });

        return msg;
      },
      message.author.id,
      "artist"
    );
  }
});

type payload = {
  components: ReturnType<typeof buildJumbleComponents>;
  flags: MessageFlags.IsComponentsV2;
};

export async function startJumble(
  channel: TextBasedChannel,
  sendMessage: (payload: payload) => Promise<Message<boolean>>,
  user: string,
  type: GameType
) {
  try {
    console.time("startJumble");
    if (channelIdtoGameId[channel.id]) {
      throw new InvalidCommandUsageError(
        "A jumble game is already in this channel."
      );
    }
    channelIdtoGameId[channel.id] = "-";
    if (!channel.isSendable()) {
      throw new InvalidCommandUsageError(
        "Cannot send messages in this channel."
      );
    }

    let answer = "";
    let hints: { random: string[]; all: string[] } = { random: [], all: [] };
    let by: string | undefined = undefined;
    const fmuser = await userMap.get(user);
    if (!fmuser) {
      throw new InvalidCommandUsageError(
        "You need to link your Last.fm account first using /link."
      );
    }
    const realType =
      type === "mix"
        ? (pickRandom(["artist", "album", "track"], 1)[0] as
            | "artist"
            | "album"
            | "track")
        : type;
    switch (realType) {
      case "artist":
        {
          const randomItem = await getRandomItem(realType, fmuser, user);

          if (!randomItem.name || !randomItem.playcount) {
            delete channelIdtoGameId[channel.id];
            throw new Error("Invalid artist data");
          }
          answer = randomItem.name;
          hints = await getArtistHints(3, randomItem, +randomItem.playcount!);
        }
        break;
      case "album":
        {
          const randomItem = await getRandomItem(realType, fmuser, user);

          if (
            !randomItem.artist?.name ||
            !randomItem.name ||
            !randomItem.playcount
          ) {
            delete channelIdtoGameId[channel.id];
            throw new Error("Invalid album data");
          }
          hints = await getAlbumHints(
            randomItem.artist.name,
            randomItem.name,
            +randomItem.playcount
          );

          answer = randomItem.name;
          by = randomItem.artist.name;
        }
        break;
      case "track":
        {
          const randomItem = await getRandomItem(realType, fmuser, user);

          if (
            !randomItem.artist?.name ||
            !randomItem.name ||
            !randomItem.playcount
          ) {
            delete channelIdtoGameId[channel.id];
            throw new Error("Invalid track data");
          }
          hints = await getTrackHints(
            randomItem.artist.name,
            randomItem.name,
            +randomItem.playcount
          );

          answer = randomItem.name;
          by = randomItem.artist.name;
        }
        break;
    }

    let jumbled = scramble(answer).toUpperCase();
    const gameId = `jumble-${Date.now().toString()}-${Math.floor(
      Math.random() * 1000
    )}`;

    const components = buildJumbleComponents(
      jumbled,
      realType,
      hints,
      gameId,
      "Type your answer within 35 seconds to make a guess",
      colors.game[realType]
    );
    const message = await sendMessage({
      components,
      flags: MessageFlags.IsComponentsV2,
    });

    games[gameId] = {
      answer,
      type: realType,
      mix: type === "mix",
      hints,
      scrambled: jumbled,
      message,
      channelId: channel.id,
      startTimestamp: Date.now(),
      answered: false,
      by,
      color: colors.game[realType],
    };
    channelIdtoGameId[channel.id] = gameId;

    setTimeout(async () => {
      const game = games[gameId];
      if (!game || game.answered) return;
      game.answered = true;
      await Promise.all([
        await game.message.edit({
          components: buildJumbleComponents(
            game.scrambled,
            game.type,
            game.hints,
            null,
            `**Time's up!**\nIt was **${game.answer}**.`,
            game.color
          ),
        }),
        await game.message.reply({
          components: buildJumbleTimeUpReplyComponents(
            game.answer,
            game.mix ? "mix" : game.type
          ),
          flags: MessageFlags.IsComponentsV2,
        }),
      ]);

      delete games[gameId];
      delete channelIdtoGameId[channel.id];
    }, 35_000);
    console.timeEnd("startJumble");
  } catch (error) {
    delete channelIdtoGameId[channel.id];
    throw error;
  }
}

function buildJumbleComponents(
  jumbled: string,
  type: string,
  hints: { random: string[]; all: string[] },
  gameId: string | null,
  suffix?: string,
  color?: number
) {
  return [
    {
      type: 17,
      accent_color: color || 15548997,
      spoiler: false,
      components: [
        {
          type: 10,
          content: `## \`${jumbled}\``,
        },
        {
          type: 10,
          content: `**Jumble - Guess the ${type}**${
            hints.random.length ? "\n" : ""
          }${hints.random.map((hint) => `- ${hint}`).join("\n")}${
            suffix ? `\n\n${suffix}` : ""
          }`,
        },
        ...(gameId
          ? [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 2,
                    label: "Add Hint",
                    emoji: null,
                    disabled: hints.random.length >= hints.all.length,
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

function buildJumbleGiveUpComponents(
  jumbled: string,
  type: string,
  hints: { random: string[]; all: string[] },
  suffix?: string,
  buttonLabel?: string,
  mix: boolean = false
) {
  return [
    {
      type: 17,
      accent_color: colors.giveUp,
      spoiler: false,
      components: [
        {
          type: 10,
          content: `## \`${jumbled}\``,
        },
        {
          type: 10,
          content: `**Jumble - Guess the ${type}**${
            hints.random.length ? "\n" : ""
          }${hints.random.map((hint) => `- ${hint}`).join("\n")}${
            suffix ? `\n\n${suffix}` : ""
          }`,
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
                    custom_id: "game_jumble_playagain_" + (mix ? "mix" : type),
                  },
                ],
              },
            ]
          : []),
      ],
    },
  ];
}

function buildJumbleAnswerComponents(
  answer: string,
  timeMs: number,
  userId: string,
  gameType: GameType,
  by?: string
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
              custom_id: `game_jumble_playagain_${gameType}`,
            },
          ],
        },
      ],
    },
  ];
}

function buildJumbleTimeUpReplyComponents(answer: string, gameType: string) {
  return [
    {
      type: 17,
      accent_color: colors.timeout,
      spoiler: false,
      components: [
        {
          type: 10,
          content: `Nobody guessed it right. It was \`${answer}\`.`,
        },
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 2,
              label: "Play Again",
              custom_id: `game_jumble_playagain_${gameType}`,
            },
          ],
        },
      ],
    },
  ];
}

function buildPlayAgainEditComponentsJumble(
  buttonMessage: any,
  label: string,
  type = "artist",
  color?: number
) {
  return [
    {
      type: 17,
      accent_color: color || colors.startUp,
      spoiler: false,
      components: [
        {
          type: 10,
          //@ts-ignore
          content: buttonMessage.components[0].components[0].content,
        },
        //@ts-ignore
        ...(buttonMessage.components[0].components[1].type === 10
          ? [
              {
                type: 10,
                //@ts-ignore
                content: buttonMessage.components[0].components[1].content,
              },
            ]
          : []),
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 2,
              label: label,
              disabled: true,
              custom_id: "game_jumble_playagain_" + type,
            },
          ],
        },
      ],
    },
  ];
}

defineEvent("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  const rawCustomId = interaction.customId;

  if (!rawCustomId.startsWith("game_")) return;
  if (!rawCustomId.startsWith("game_jumble")) return;
  const customId = rawCustomId.slice(5);
  const parts = customId.split("_");
  const gameId = parts.slice(0, -1).join("_");
  const action = parts[parts.length - 1];

  if (customId.startsWith("jumble_playagain_")) {
    const gameType = customId.replace("jumble_playagain_", "") as
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

    let message!: Message;

    if (!canStartGameInChannel(channel.id)) {
      return interaction.deferUpdate();
    }
    await startJumble(
      channel,
      async (payload) => {
        message = await channel.send({ ...payload });

        return message;
      },
      interaction.user.id,
      gameType
    );
    await interaction.deferUpdate();
    const buttonMessage = interaction.message;

    //@ts-ignore

    await buttonMessage.edit({
      components: buildPlayAgainEditComponentsJumble(
        buttonMessage,
        `${interaction.user.displayName} is playing again!`,
        gameType,
        //@ts-ignore
        buttonMessage.components[0].data.accent_color
      ),
    });

    return;
  }

  const game = games[gameId];

  if (!game)
    return interaction.reply({
      content: "Game not found.",
      flags: MessageFlags.Ephemeral,
    });

  if (action === "hint") {
    const newHints = pickRandom(game.hints.all, 1, game.hints.random);
    game.hints.random.push(...newHints);

    await Promise.all([
      await game.message.edit({
        components: buildJumbleComponents(
          game.scrambled,
          game.type,
          game.hints,
          gameId,

          "Type your answer within 35 seconds to make a guess",
          game.color
        ),
      }),
      await interaction.deferUpdate(),
    ]);
  } else if (action === "reshuffle") {
    game.scrambled = scramble(game.answer).toUpperCase();
    await Promise.all([
      await game.message.edit({
        components: buildJumbleComponents(
          game.scrambled,
          game.type,
          game.hints,
          gameId,

          "Type your answer within 35 seconds to make a guess",
          game.color
        ),
      }),
      await interaction.deferUpdate(),
    ]);
  } else if (action === "giveup") {
    game.answered = true;
    await game.message.edit({
      components: buildJumbleGiveUpComponents(
        game.scrambled,
        game.type,
        game.hints,
        `**<@${interaction.user.id}> gave up!**\nThe answer was **${game.answer}**.`,
        undefined,
        game.mix
      ),
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
  if (!game || isPixelGame(game)) return;

  if (game.answered) return;

  const userGuess = message.content.trim().toLowerCase();
  if (Math.abs(userGuess.length - game.answer.length) > 5) return;
  if (levenshteinDistance(userGuess, game.answer.toLowerCase()) <= 1) {
    game.answered = true;
    await Promise.all([
      await game.message.edit({
        components: buildJumbleComponents(
          game.scrambled,
          game.type,
          game.hints,
          null,
          `**<@${message.author.id}> guessed it!**`,
          game.color
        ),
      }),
      await message.react("✅"),
      await message.reply({
        components: buildJumbleAnswerComponents(
          game.answer,
          message.createdTimestamp - game.startTimestamp,
          message.author.id,
          game.mix ? "mix" : game.type,
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
