interface TopAlbumsResponse {
  topalbums: Topalbums;
}

interface Topalbums {
  album: Album[];
  '@attr': Attr2;
}

interface Attr2 {
  user: string;
  totalPages: string;
  page: string;
  perPage: string;
  total: string;
}

interface Album {
  artist: Artist;
  image: Image[];
  mbid: string;
  url: string;
  playcount: string;
  '@attr': Attr;
  name: string;
}

interface Attr {
  rank: string;
}

interface Image {
  size: string;
  '#text': string;
}

interface Artist {
  url: string;
  name: string;
  mbid: string;
}