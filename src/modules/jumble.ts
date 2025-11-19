import {
  ApplicationCommandOptionType,
  CacheType,
  ChatInputCommandInteraction,
  Message,
  MessageFlags,
  TextBasedChannel,
} from "discord.js";
import { userMap } from "modules/link";
import { defineChatCommand, defineEvent } from "strife.js";
import { InvalidCommandUsageError } from "util/errors.js";
import { fm } from "util/fm.js";
import { pickRandomWeighedByParam } from "util/functions";
import { musicbrainz } from "util/musicbrainz";
import { levenshteinDistance, scramble } from "util/text";
import { set } from "zod";

type JumbleGame = {
  answer: string;
  type: "artist" | "album" | "track";
  hints: { random: string[]; all: string[] };
  scrambled: string;
  channelId: string;
  message: Message<boolean>;
  startTimestamp: number;
  answered: boolean;
};

const jumbleGames: Record<string, JumbleGame> = {};

const channelIdtoGameId: Record<string, string> = {};
console.log("Initialized jumble module");
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
        },
      },
    },
  },
  async (interaction, options) => {
    console.log(options);
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

    console.log("starting new jumble game");
    await startJumble(
      channel,
      async (payload) => {
        const msg = await channel.send({ ...payload });
        console.log("sent message", msg.id);
        return msg;
      },
      message.author.id,
      "artist"
    );
  }
});

type payload = {
  components: ReturnType<typeof getComponents>;
  flags: MessageFlags.IsComponentsV2;
};

export async function startJumble(
  channel: TextBasedChannel,
  sendMessage: (payload: payload) => Promise<Message<boolean>>,
  user: string,
  type: "artist" | "album" | "track"
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
    const fmuser = await userMap.get(user);
    if (!fmuser) {
      throw new InvalidCommandUsageError(
        "You need to link your Last.fm account first using /link."
      );
    }
    console.log("fmuser", fmuser);
    switch (type) {
      case "artist":
        {
          const list = await fm.user.topArtists(fmuser.lastfm);
          const randomItem = pickRandomWeighedByParam(
            list.topartists.artist,
            "playcount",
            4 // funny
          )!;
          console.log(randomItem);
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
          const list = await fm.user.topAlbums(fmuser.lastfm);
          // const randomItem =
          //   list.topalbums.album[
          //     Math.floor(Math.random() * list.topalbums.album.length)
          //   ];
          const randomItem = pickRandomWeighedByParam(
            list.topalbums.album,
            "playcount",
            4 // funny
          )!;
          console.log(randomItem);
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
        }
        break;
      case "track":
        {
          const list = await fm.user.topTracks(fmuser.lastfm);
          // const randomItem =
          //   list.toptracks.track[
          //     Math.floor(Math.random() * list.toptracks.track.length)
          //   ];
          const randomItem = pickRandomWeighedByParam(
            list.toptracks.track,
            "playcount",
            4 // funny
          )!;
          console.log(randomItem);
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
        }
        break;
    }

    let jumbled = scramble(answer).toUpperCase();
    const gameId = `jumble-${Date.now().toString()}-${Math.floor(
      Math.random() * 1000
    )}`;

    const components = getComponents(
      jumbled,
      type,
      hints,
      gameId,
      "Type your answer within 35 seconds to make a guess"
    );
    const message = await sendMessage({
      components,
      flags: MessageFlags.IsComponentsV2,
    });

    console.log("started jumble game", gameId);
    jumbleGames[gameId] = {
      answer,
      type,
      hints,
      scrambled: jumbled,
      message,
      channelId: channel.id,
      startTimestamp: Date.now(),
      answered: false,
    };
    channelIdtoGameId[channel.id] = gameId;

    setTimeout(async () => {
      const game = jumbleGames[gameId];
      if (!game || game.answered) return;
      game.answered = true;
      await Promise.all([
        await game.message.edit({
          components: getComponents(
            game.scrambled,
            game.type,
            game.hints,
            null,
            `**Time's up!**\nIt was **${game.answer}**.`
          ),
        }),
        await game.message.reply({
          components: [
            {
              type: 17,
              accent_color: 15548997,
              spoiler: false,
              components: [
                {
                  type: 10,
                  content: `Nobody guessed it right. It was \`${game.answer}\`.`,
                },
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 2,
                      label: "Play Again",
                      custom_id: `game_jumble_playagain_${game.type}`,
                    },
                  ],
                },
              ],
            },
          ],
          flags: MessageFlags.IsComponentsV2,
        }),
      ]);

      delete jumbleGames[gameId];
      delete channelIdtoGameId[channel.id];
    }, 35_000);
    console.timeEnd("startJumble");
  } catch (error) {
    delete channelIdtoGameId[channel.id];
    throw error;
  }
}

function getComponents(
  jumbled: string,
  type: string,
  hints: { random: string[]; all: string[] },
  gameId: string | null,
  suffix?: string
) {
  return [
    {
      type: 17,
      accent_color: 15548997,
      spoiler: false,
      components: [
        {
          type: 10,
          content: `## \`${jumbled}\``,
        },
        {
          type: 10, //hint 1\n- hint 2\n- hint 3
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

function getGiveUpComponents(
  jumbled: string,
  type: string,
  hints: { random: string[]; all: string[] },
  suffix?: string,
  buttonLabel?: string
) {
  return [
    {
      type: 17,
      accent_color: 15548997,
      spoiler: false,
      components: [
        {
          type: 10,
          content: `## \`${jumbled}\``,
        },
        {
          type: 10, // youre mothre
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
                    custom_id: "game_jumble_playagain",
                  },
                ],
              },
            ]
          : []),
      ],
    },
  ];
}

function getAnswerComponents(
  answer: string,
  timeMs: number,
  userId: string,
  gameType: "artist" | "album" | "track"
) {
  return [
    {
      type: 17,
      accent_color: 15548997,
      spoiler: false,
      components: [
        {
          type: 10,
          content: `<@${userId}> got it! The answer was \`${answer}\`.\nAnswered in ${Intl.NumberFormat(
            "en-US",
            {
              maximumFractionDigits: 2,
            }
          ).format(timeMs / 1000)}s.`,
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

defineEvent("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  const rawCustomId = interaction.customId;
  console.log("jumble interaction", rawCustomId);
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
    console.log("starting new jumble game");
    await startJumble(
      channel,
      async (payload) => {
        message = await channel.send({ ...payload });
        console.log("sent message", message.id);
        return message;
      },
      interaction.user.id,
      gameType
    );
    await interaction.deferUpdate();
    const buttonMessage = interaction.message;

    await buttonMessage.edit({
      components: [
        {
          type: 17,
          accent_color: 15548997,
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
                  label: `${interaction.user.displayName} is playing again!`,
                  disabled: true,
                  custom_id: "game_jumble_playagain_artist",
                },
              ],
            },
          ],
        },
      ],
    });

    return;
  }

  const game = jumbleGames[gameId];

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

    let message!: Message;
    console.log("starting new jumble game");
    await startJumble(
      channel,
      async (payload) => {
        message = await channel.send({ ...payload });
        console.log("sent message", message.id);
        return message;
      },
      interaction.user.id,
      game ? game.type : "artist"
    );
    await interaction.deferUpdate();
    const buttonMessage = interaction.message;

    await buttonMessage.edit({
      components: [
        {
          type: 17,
          accent_color: 15548997,
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
                  label: `${interaction.user.displayName} is playing again!`,
                  disabled: true,
                  custom_id: "game_jumble_playagain_artist",
                },
              ],
            },
          ],
        },
      ],
    });

    return;
  }

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
        components: getComponents(
          game.scrambled,
          game.type,
          game.hints,
          gameId
        ),
      }),
      await interaction.deferUpdate(),
    ]);
  } else if (action === "reshuffle") {
    game.scrambled = scramble(game.answer).toUpperCase();
    await Promise.all([
      await game.message.edit({
        components: getComponents(
          game.scrambled,
          game.type,
          game.hints,
          gameId
        ),
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
    });
    delete jumbleGames[gameId];
    delete channelIdtoGameId[game.channelId];
  }
});

defineEvent("messageCreate", async (message) => {
  if (message.author.bot) return;
  const channelId = message.channel.id;
  console.log("message in channel", channelId);
  const gameId = channelIdtoGameId[channelId];
  if (!gameId) return;
  const game = jumbleGames[gameId];
  if (!game) return;
  if (game.answered) return;

  const userGuess = message.content.trim().toLowerCase();
  if (Math.abs(userGuess.length - game.answer.length) > 5) return;
  if (levenshteinDistance(userGuess, game.answer.toLowerCase()) <= 1) {
    game.answered = true;
    await Promise.all([
      await game.message.edit({
        components: getComponents(
          game.scrambled,
          game.type,
          game.hints,
          null,
          `**<@${message.author.id}> guessed it!**`
        ),
      }),
      await message.react("✅"),
      await message.reply({
        components: getAnswerComponents(
          game.answer,
          message.createdTimestamp - game.startTimestamp,
          message.author.id,
          game.type
        ),
        flags: MessageFlags.IsComponentsV2,
      }),
    ]);
    delete jumbleGames[gameId];
    delete channelIdtoGameId[channelId];
  } else if (levenshteinDistance(userGuess, game.answer) <= 3) {
    await message.react("🤏");
  } else {
    await message.react("❌");
  }
});

async function getArtistHints(
  number = 3,
  artist: FmArtistInfo["artist"],
  plays: number
) {
  const mbid = artist.mbid;
  if (!mbid) return { random: [], all: [] };
  const mbInfo = await musicbrainz.artist.info(mbid);
  const hints: string[] = [];
  if (mbInfo.country) {
    hints.push(`Their country flag: :flag_${mbInfo.country.toLowerCase()}:`);
  }
  if (mbInfo.disambiguation) {
    hints.push(`They might be described as **${mbInfo.disambiguation}**`);
  }
  hints.push(`You have ${plays} play${plays !== 1 ? "s" : ""} on this artist`);
  if (artist.tags && artist.tags.tag.length > 0) {
    const tagNames = artist.tags.tag.map((t) => t.name);
    const filtered = tagNames.filter(
      (t) => !t.toLowerCase().includes((artist.name ?? "").toLowerCase())
    );
    if (filtered.length > 0) {
      hints.push(`One of their tags is ${filtered.join(", ")}`);
    }
  }
  if (mbInfo["life-span"].begin) {
    const yearSeconds = new Date(mbInfo["life-span"].begin).getTime() / 1000;
    hints.push(`They were born **<t:${Math.floor(yearSeconds)}:R>**`);
  }
  if (mbInfo["life-span"].end) {
    const endSeconds = new Date(mbInfo["life-span"].end).getTime() / 1000;
    hints.push(`They passed away **<t:${Math.floor(endSeconds)}:R>**`);
  }
  if (mbInfo.type) {
    hints.push(`They are a **${mbInfo.type}**`);
  }

  return { random: pickRandom(hints, number), all: hints };
}

async function getAlbumHints(
  artist: string,
  album: string,
  playcount?: number
) {
  const albumInfo = await fm.album.info(artist, album);
  const hints: string[] = [];
  albumInfo.album.wiki?.published; // 06 Jun 2025, 04:29
  if (albumInfo.album.wiki?.published) {
    const publishedDate = new Date(albumInfo.album.wiki.published);
    const publishedSeconds = publishedDate.getTime() / 1000;
    hints.push(`It was released **<t:${Math.floor(publishedSeconds)}:R>**`);
  }
  if (albumInfo.album.tags && albumInfo.album.tags.tag.length > 0) {
    const tagNames = albumInfo.album.tags.tag.map((t) => t.name);
    const filtered = tagNames.filter(
      (t) => !t.toLowerCase().includes((album ?? "").toLowerCase())
    );
    if (filtered.length > 0) {
      hints.push(`One of its tags is ${filtered.join(", ")}`);
    }
  }
  if (albumInfo.album.tracks && albumInfo.album.tracks.track.length > 0) {
    const trackNames = albumInfo.album.tracks.track.map((t) => t.name);
    hints.push(`One of its tracks is "${pickRandom(trackNames, 1)[0]}"`);
  }
  if (albumInfo.album.listeners) {
    hints.push(
      `It has ${Intl.NumberFormat("en-US").format(
        +albumInfo.album.listeners
      )} listeners`
    );
  }
  if (playcount) {
    hints.push(
      `You have ${playcount} play${playcount !== 1 ? "s" : ""} on this album`
    );
  }
  return { random: pickRandom(hints, 3), all: hints };
}
async function getTrackHints(
  artist: string,
  track: string,
  playcount?: number
) {
  const trackInfo = await fm.track.info(artist, track);
  const hints: string[] = [];
  if (trackInfo.track.wiki?.published) {
    const publishedDate = new Date(trackInfo.track.wiki.published);
    const publishedSeconds = publishedDate.getTime() / 1000;
    hints.push(`It was released **<t:${Math.floor(publishedSeconds)}:R>**`);
  }

  if (trackInfo.track.album?.title) {
    hints.push(`It is from the album "${trackInfo.track.album.title}"`);
  }

  if (trackInfo.track.toptags?.tag && trackInfo.track.toptags.tag.length > 0) {
    const tagNames = trackInfo.track.toptags.tag.map((t) => t.name);
    const filtered = tagNames.filter(
      (t) => !t.toLowerCase().includes((track ?? "").toLowerCase())
    );
    if (filtered.length > 0) {
      hints.push(`One of its tags is ${filtered.join(", ")}`);
    }
  }

  if (trackInfo.track.duration) {
    const durationSeconds = Math.floor(+trackInfo.track.duration / 1000);
    hints.push(`Its duration is ${durationSeconds} seconds`);
  }

  if (playcount) {
    hints.push(
      `You have ${playcount} play${playcount !== 1 ? "s" : ""} on this track`
    );
  }

  return { random: pickRandom(hints, 3), all: hints };
}

function pickRandom<T>(arr: T[], count: number, existing: T[] = []): T[] {
  const available = arr.filter((item) => !existing.includes(item));

  if (available.length <= count) return [...available];

  const result: T[] = [];
  const copy = [...available];

  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy[idx]);
    copy.splice(idx, 1);
  }

  return result;
}
