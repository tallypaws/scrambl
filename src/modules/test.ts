import { musicbrainz } from "util/musicbrainz";
import { fm } from "../util/fm";


//write json files for every method

import { writeFileSync } from "fs";

async function writeJsonFiles() {
  const topTracks = await fm.user.topTracks("thetally");
  writeFileSync("topTracks.json", JSON.stringify(topTracks, null, 2));

  const topArtists = await fm.user
    .topArtists("thetallykjhaslkdjfhalsj")
    .catch((e) => {
      if (e instanceof Response) {
        
        return {status: e.status}
      }
    });
  writeFileSync("topArtists.json", JSON.stringify(topArtists, null, 2));

  const topAlbums = await fm.user.topAlbums("thetally");
  writeFileSync("topAlbums.json", JSON.stringify(topAlbums, null, 2));

  const trackInfo = await fm.track.info("Coldplay", "Yellow");
  writeFileSync("trackInfo.json", JSON.stringify(trackInfo, null, 2));

  const trackTags = await fm.track.tags("Coldplay", "Yellow");
  writeFileSync("trackTags.json", JSON.stringify(trackTags, null, 2));

  const albumInfo = await fm.album.info("Coldplay", "Parachutes");
  writeFileSync("albumInfo.json", JSON.stringify(albumInfo, null, 2));

  const albumTags = await fm.album.tags("Coldplay", "Parachutes");
  writeFileSync("albumTags.json", JSON.stringify(albumTags, null, 2));

  const artistInfo = await fm.artist.info("Spellcasting");
  writeFileSync("artistInfo.json", JSON.stringify(artistInfo, null, 2));

  const artistTags = await fm.artist.tags("Coldplay");
  writeFileSync("artistTags.json", JSON.stringify(artistTags, null, 2));

  const musicbrainzArtistInfo = await musicbrainz.artist.info(
    "eb3c021d-e056-42d6-8fad-064205a90527"
  );
  writeFileSync(
    "musicbrainzArtistInfo.json",
    JSON.stringify(musicbrainzArtistInfo, null, 2)
  );
}

// writeJsonFiles();
