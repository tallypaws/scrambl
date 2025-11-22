import { memoize } from "./functions.js";

const base = "https://musicbrainz.org/ws/2/";
async function musicbrainzRequest<R = any>(
  entityType: string,
  params: Record<string, string> = {}
): Promise<R> {
  const response = await fetch(
    base + entityType + "?" + new URLSearchParams({ ...params, fmt: "json" }),
    {
      headers: {
        "User-Agent":
          "Natalie - scrambl discord bot (https://github.com/tallypaws/scrambl/)",
        accept: "application/json",
      },
    }
  );
  if (!response.ok) {
    throw new Error(`MusicBrainz request failed: ${response.statusText}`);
  }
  return response.json();
}

async function fetchArtistMbIDByName(
  artistName: string
): Promise<string | null> {
  const searchResults = await musicbrainzRequest("artist", {
    query: artistName,
    limit: "1",
  });
  if (searchResults.artists.length > 0) {
    return searchResults.artists[0].id;
  }
  return null;
}

async function fetchArtistInfo(mbid: string) {
  const artist = await musicbrainzRequest<MusicbrainzArtistInfo>(
    "artist/" + mbid
  );
  
  return artist;
}

async function fetchArtistGenres(mbid: string) {}

export const musicbrainz = {
  artist: {
    idByName: memoize(fetchArtistMbIDByName),
    info: memoize(fetchArtistInfo),
  },
};
