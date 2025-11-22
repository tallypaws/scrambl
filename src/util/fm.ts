import { memoize } from "./functions.js";

const apiBase = "http://ws.audioscrobbler.com/2.0/";
const apiKey = process.env.LASTFM_API_KEY;

async function fmRequest(
  method: string,
  params: Record<string, string>
): Promise<any> {
  const url = new URL(apiBase);
  url.searchParams.append("method", method);
  url.searchParams.append("api_key", apiKey!);
  url.searchParams.append("format", "json");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw response
  }
  return response.json();
}

async function fetchTopAlbumsForUser(
  username: string,
  limit = 500
): Promise<FmTopAlbums> {
  const data = await fmRequest("user.gettopalbums", {
    user: username,
    limit: limit.toString(),
  });
  return data;
}

async function fetchTopTracksForUser(
  username: string,
  limit = 500
): Promise<FmTopTracks> {
  const data = await fmRequest("user.gettoptracks", {
    user: username,
    limit: limit.toString(),
  });
  return data;
}

async function fetchTopArtistsForUser(
  username: string,
  limit = 500
): Promise<FmTopArtists> {
  const data = await fmRequest("user.gettopartists", {
    user: username,
    limit: limit.toString(),
  });
  return data;
}

async function fetchTrackInfo(artist: string, track: string): Promise<FmTrackInfo> {
  const data = await fmRequest("track.getInfo", {
    artist,
    track,
  });
  return data;
}

async function fetchTrackTags(artist: string, track: string): Promise<FmTrackTags> {
  const data = await fmRequest("track.getTopTags", {
    artist,
    track,
  });
  return data;
}

async function fetchAlbumInfo(artist: string, album: string): Promise<FmAlbumInfo> {
  const data = await fmRequest("album.getInfo", {
    artist,
    album,
  });
  return data;
}

async function fetchAlbumTags(artist: string, album: string): Promise<FmAlbumTags> {
  const data = await fmRequest("album.getTopTags", {
    artist,
    album,
  });
  return data;
}

async function fetchArtistInfo(artist: string): Promise<FmArtistInfo> {
  const data = await fmRequest("artist.getInfo", {
    artist,
  });
  return data;
}

async function fetchArtistTags(artist: string): Promise<FmArtistTags> {
  const data = await fmRequest("artist.getTopTags", {
    artist,
  });
  return data;
}

const fm = {
  user: {
    topTracks: memoize(fetchTopTracksForUser),
    topArtists: memoize(fetchTopArtistsForUser),
    topAlbums: memoize(fetchTopAlbumsForUser),
  },
    track: {
      info: memoize(fetchTrackInfo),
      tags: memoize(fetchTrackTags),
    },
    album: {
      info: memoize(fetchAlbumInfo),
      tags: memoize(fetchAlbumTags),
    },
    artist: {
      info: memoize(fetchArtistInfo),
      tags: memoize(fetchArtistTags),
    },
};

export default fm;
export { fm };
