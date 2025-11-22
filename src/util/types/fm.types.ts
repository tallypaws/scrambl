type FmTopAlbums = {
  topalbums: {
    album: Array<{
      name: string;
      mbid?: string;
      url?: string;
      playcount?: string;

      artist?: {
        name?: string;
        mbid?: string;
        url?: string;
        [key: string]: unknown;
      };

      image?: Array<{
        "#text": string;
        size: "small" | "medium" | "large" | "extralarge" | string;
      }>;

      "@attr"?: { rank?: string } | Record<string, string>;

      [key: string]: unknown;
    }>;
    "@attr"?: Record<string, string>;
  };
};

type FmTopArtists = {
  topartists: {
    artist: Array<{
      name: string;
      mbid?: string;
      url?: string;
      playcount?: string;
      streamable?: "0" | "1" | string;

      image?: Array<{
        "#text": string;
        size: "small" | "medium" | "large" | "extralarge" | string;
      }>;

      "@attr"?: { rank?: string } | Record<string, string>;
      [key: string]: unknown;
    }>;
    "@attr"?: {
      user?: string;
      totalPages?: string;
      page?: string;
      total?: string;
      perPage?: string;
      [key: string]: string | undefined;
    };
  };
};

type FmTopTracks = {
  toptracks: {
    track: Array<{
      name: string;
      url?: string;
      artist?: { name?: string; mbid?: string; url?: string };
      playcount?: string;
      listeners?: string;

      image?: Array<{
        "#text": string;
        size: "small" | "medium" | "large" | "extralarge" | string;
      }>;

      "@attr"?: { rank?: string } | Record<string, string>;
      [key: string]: unknown;
    }>;
    "@attr"?: Record<string, string>;
  };
};

type FmTrackInfo = {
  track: {
    name: string;
    url?: string;
    duration?: string;
    streamable?: { "#text"?: string; fulltrack?: string } | string;
    listeners?: string;
    playcount?: string;

    artist?: {
      name?: string;
      mbid?: string;
      url?: string;
      [key: string]: unknown;
    };

    album?: {
      artist?: string;
      title?: string;
      url?: string;
      image?: Array<{
        "#text": string;
        size: "small" | "medium" | "large" | "extralarge" | string;
      }>;
      [key: string]: unknown;
    };

    toptags?: {
      tag: Array<{ name: string; url?: string }>;
    };

    wiki?: {
      published?: string;
      summary?: string;
      content?: string;
      [key: string]: unknown;
    };

    [key: string]: unknown;
  };
};

type FmTrackTags = {
  toptags: {
    tag: Array<{
      count: number;
      name: string;
      url?: string;
      [key: string]: unknown;
    }>;
    "@attr"?: { artist?: string; track?: string } | Record<string, string>;
    [key: string]: unknown;
  };
};

type FmAlbumInfo = {
  album: {
    artist?: string;
    mbid?: string;
    playcount?: string;

    image?: Array<{
      "#text": string;
      size: "small" | "medium" | "large" | "extralarge" | "mega" | "" | string;
    }>;

    tracks?: {
      track: Array<{
        streamable?: { fulltrack?: string; "#text"?: string } | string;
        duration?: number | string;
        url?: string;
        name: string;
        "@attr"?: { rank?: number } | Record<string, unknown>;
        artist?: { url?: string; name?: string; mbid?: string };
        [key: string]: unknown;
      }>;
    };

    url?: string;
    name?: string;
    listeners?: string;

    tags?: {
      tag: Array<{ name: string; url?: string; [key: string]: unknown }>;
    };

    wiki?: {
      published?: string;
      summary?: string;
      content?: string;
      [key: string]: unknown;
    };

    [key: string]: unknown;
  };
};

type FmAlbumTags = {
  toptags: {
    tag: Array<{
      count: number;
      name: string;
      url?: string;
      [key: string]: unknown;
    }>;
    "@attr"?: { artist?: string; album?: string } | Record<string, string>;
    [key: string]: unknown;
  };
};

type FmArtistInfo = {
  artist: {
    name: string;
    mbid?: string;
    url?: string;

    image?: Array<{
      "#text": string;
      size: "small" | "medium" | "large" | "extralarge" | "mega" | "" | string;
    }>;

    streamable?: "0" | "1" | string;
    rontour?: "0" | "1" | string;

    stats?: { listeners?: string; playcount?: string; [key: string]: unknown };

    similar?: {
      artist: Array<{
        name: string;
        url?: string;
        image?: Array<{
          "#text": string;
          size:
            | "small"
            | "medium"
            | "large"
            | "extralarge"
            | "mega"
            | ""
            | string;
        }>;
        [key: string]: unknown;
      }>;
    };

    tags?: {
      tag: Array<{ name: string; url?: string; [key: string]: unknown }>;
    };

    bio?: {
      links?: { link?: { "#text"?: string; rel?: string; href?: string } };
      published?: string;
      summary?: string;
      content?: string;
      [key: string]: unknown;
    };

    [key: string]: unknown;
  };
};

type FmArtistTags = {
  toptags: {
    tag: Array<{
      count: number;
      name: string;
      url?: string;
      [key: string]: unknown;
    }>;
    "@attr"?: { artist?: string } | Record<string, string>;
    [key: string]: unknown;
  };
};
