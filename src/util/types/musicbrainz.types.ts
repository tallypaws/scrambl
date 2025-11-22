type MusicbrainzArtistInfo = {
  isnis: [];
  area: {
    name: string;
    type: null;
    disambiguation: "";
    id: string;
    "sort-name": string;
    "type-id": null;
  };
  "life-span": {
    begin: string;
    ended: boolean;
    end: null | string;
  };
  type: "Person" | "Group" | "Orchestra" | "Choir" | "Character" | "Other";
  disambiguation: string;
  gender: string;
  country: string;
  "sort-name": string;
  "type-id": string;
  "begin-area": null;
  name: string;
  "gender-id": string;
  ipis: [];
  id: string;
  "end-area": null;
};

/*
{
    "isnis": [],
    "area": {
      "name": "Toronto",
      "type": null,
      "disambiguation": "",
      "id": "74b24e62-d2fe-42d2-9d96-31f2da756c77",
      "sort-name": "Toronto",
      "type-id": null
    },
    "life-span": {
      "begin": "2003",
      "ended": false,
      "end": null
    },
    "type": "Person",
    "disambiguation": "Canadian breakcore/hardcore producer",
    "gender": "Female",
    "country": "CA",
    "sort-name": "Femtanyl",
    "type-id": "b6e035f4-3ce9-331c-97df-83397230b0df",
    "begin-area": null,
    "name": "femtanyl",
    "gender-id": "93452b5a-a947-30c8-934f-6a4056b151c2",
    "ipis": [],
    "id": "eb3c021d-e056-42d6-8fad-064205a90527",
    "end-area": null
  }
*/
