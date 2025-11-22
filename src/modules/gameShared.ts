import { Message } from "discord.js";
import { fm } from "util/fm.js";
import { musicbrainz } from "util/musicbrainz";
import { pickRandomWeighedByParam } from "util/functions";
import { levenshteinDistance } from "util/text";

export type GameType = "artist" | "album" | "track" | "mix";

export type GameBase = {
  answer: string;
  type: GameType;
  mix?: boolean;
  hints: { random: string[]; all: string[] };
  scrambled: string;
  channelId: string;
  message: Message<boolean>;
  startTimestamp: number;
  answered: boolean;
  by?: string;
  color: number
};

export type JumbleGame = GameBase;

export type PixelGame = GameBase & {
  imageBuffer: Buffer;
  pixelateLevel: number;
};

export type Game = JumbleGame | PixelGame;
export const games: Record<string, Game> = {};
export const channelIdtoGameId: Record<string, string> = {};

type RecentEntry = { key: string; ts: number };
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export const recentSelections: Record<
  string,
  {
    artist: RecentEntry[];
    album: RecentEntry[];
    track: RecentEntry[];
  }
> = {};

function pruneRecentFor(
  userId: string,
  gameType: "artist" | "album" | "track"
) {
  const now = Date.now();
  const user = recentSelections[userId];
  if (!user) return;
  user[gameType] = user[gameType].filter((e) => now - e.ts <= RECENT_WINDOW_MS);
}

export function recordRecentSelection(
  userId: string,
  gameType: "artist" | "album" | "track",
  key: string
) {
  if (!recentSelections[userId]) {
    recentSelections[userId] = { artist: [], album: [], track: [] };
  }
  pruneRecentFor(userId, gameType);
  recentSelections[userId][gameType].push({ key, ts: Date.now() });
}

export function getRecentKeys(
  userId: string,
  gameType: "artist" | "album" | "track"
): Set<string> {
  const user = recentSelections[userId];
  if (!user) return new Set();
  pruneRecentFor(userId, gameType);
  return new Set(user[gameType].map((e) => e.key));
}

export function pickRandomWeighedAvoidRecent<T = any>(
  list: T[],
  weightParam: string,
  weightExp: number,
  userId?: string,
  gameType?: "artist" | "album" | "track",
  keyFn?: (item: T) => string
): T | undefined {
  if (!list || list.length === 0) return undefined;
  const identity = keyFn
    ? keyFn
    : (it: any) => {
        if (!it) return String(it);
        if (typeof it === "string") return it;
        if (it.name) return String(it.name);
        if (it.title) return String(it.title);
        if (it.artist && it.name) return `${it.artist.name}::${it.name}`;
        return JSON.stringify(it);
      };

  let candidates = list;
  if (userId && gameType) {
    const recent = getRecentKeys(userId, gameType);
    const filtered = list.filter((it) => !recent.has(identity(it)));
    if (filtered.length > 0) candidates = filtered;
  }

  const picked = pickRandomWeighedByParam(
    candidates as any[],
    weightParam,
    weightExp
  );

  if (picked && userId && gameType) {
    try {
      const key = identity(picked as T);
      recordRecentSelection(userId, gameType, key);
    } catch (err) {}
  }
  return picked;
}

export function isPixelGame(g: Game): g is PixelGame {
  return (
    typeof (g as PixelGame).pixelateLevel === "number" &&
    (g as PixelGame).imageBuffer instanceof Buffer
  );
}

export function pickRandom<T>(
  arr: T[],
  count: number,
  existing: T[] = []
): T[] {
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

export async function getArtistHints(
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
      hints.push(`Some of their tags are ${filtered.join(", ")}`);
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

export async function getAlbumHints(
  artist: string,
  album: string,
  playcount?: number
) {
  const albumInfo = await fm.album.info(artist, album);
  const hints: string[] = [];
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
      hints.push(`Some of its tags are ${filtered.join(", ")}`);
    }
  }
  if (albumInfo.album.tracks && albumInfo.album.tracks.track.length > 0) {
    const trackNames = albumInfo.album.tracks.track.map((t) => t.name)

    const filtered = trackNames.filter((t) => {
      const dist = levenshteinDistance(album.toLowerCase(), t.toLowerCase());
      const maxLen = Math.max(album.length, t.length);
      const relative = maxLen === 0 ? 0 : dist / maxLen;
      const includes = t.toLowerCase().includes(album.toLowerCase());
      return !(dist <= 3 || relative <= 0.25 || includes);
    });

    if (filtered.length === 0) return { random: [], all: [] };
    hints.push(`One of its tracks is "${pickRandom(filtered, 1)[0]}"`);
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

export async function getTrackHints(
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
    const albumTitle = trackInfo.track.album.title;
    const trackTitle = track;

    const dist = levenshteinDistance(albumTitle.toLowerCase(), trackTitle.toLowerCase());
    const maxLen = Math.max(albumTitle.length, trackTitle.length);
    const relative = maxLen === 0 ? 0 : dist / maxLen;
    const includes = trackTitle.toLowerCase().includes(albumTitle.toLowerCase()) || albumTitle.toLowerCase().includes(trackTitle.toLowerCase());
    if (!(dist <= 3 || relative <= 0.25 || includes)) {
        hints.push(`It is from the album "${albumTitle}"`);
    }
}

  if (trackInfo.track.toptags?.tag && trackInfo.track.toptags.tag.length > 0) {
    const tagNames = trackInfo.track.toptags.tag.map((t) => t.name);
    const filtered = tagNames.filter(
      (t) => !t.toLowerCase().includes((track ?? "").toLowerCase())
    );
    if (filtered.length > 0) {
      hints.push(`Some of its tags are ${filtered.join(", ")}`);
    }
  } 

const durMs = Number(trackInfo.track.duration ?? 0);
if (durMs > 0) {
    const durationSeconds = Math.floor(durMs / 1000);
    hints.push(`Its duration is ${secondsToHMS(durationSeconds)}`);
}

  if (playcount) {
    hints.push(
      `You have ${playcount} play${playcount !== 1 ? "s" : ""} on this track`
    );
  }

  return { random: pickRandom(hints, 3), all: hints };
}

export function componentsSimple(content: string) {
  return [
    {
      type: 17,
      accent_color: 15548997,
      spoiler: false,
      components: [
        {
          type: 10,
          content,
        },
      ],
    },
  ];
}

export const getRandomItem = async (
  type: "artist" | "album" | "track",
  fmuser: any,
  user: string
) => {
  const list =
    type === "artist"
      ? await fm.user.topArtists(fmuser.lastfm)
      : type === "album"
      ? await fm.user.topAlbums(fmuser.lastfm)
      : await fm.user.topTracks(fmuser.lastfm);

  return pickRandomWeighedAvoidRecent(
    //@ts-ignore
    list[
      type === "artist"
        ? "topartists"
        : type === "album"
        ? "topalbums"
        : "toptracks"
    ][type === "artist" ? "artist" : type === "album" ? "album" : "track"],
    "playcount",
    0.6, // funny
    user,
    type,
    (it: any) => `${it.artist?.name ?? ""}::${it.name ?? it.title ?? ""}`
  )!;
};
  
function secondsToHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (h > 0) parts.push(`${h} hour${h !== 1 ? "s" : ""}`);
  if (m > 0) parts.push(`${m} minute${m !== 1 ? "s" : ""}`);
  if (s > 0) parts.push(`${s} second${s !== 1 ? "s" : ""}`);
  return parts.join(", ");
}

export function canStartGameInChannel(channelId: string) {
  return !channelIdtoGameId[channelId];
}