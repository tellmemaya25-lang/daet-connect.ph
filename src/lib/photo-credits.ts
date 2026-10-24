/** Photographs from Wikimedia Commons, resized to 1600px wide. Credit them wherever shown. */
export type PhotoCredit = {
  file: string;
  alt: string;
  place: string;
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
};

const BY_SA = { license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" };

export const PHOTOS = {
  bagasbas: {
    file: "/images/daet/bagasbas.jpg",
    alt: "Two people walking on Bagasbas beach at low tide, the sunrise reflected in the wet sand",
    place: "Bagasbas",
    title: "Bagasbas Beach",
    author: "Ranier Rivera",
    ...BY_SA,
    source: "https://commons.wikimedia.org/wiki/File:Bagasbas_Beach.jpg",
  },
  calaguas: {
    file: "/images/daet/calaguas.jpg",
    alt: "White sand beach and forested headland on Calaguas Island",
    place: "Calaguas",
    title: "Calaguas Island beachfront",
    author: "Hcmnavarramd",
    ...BY_SA,
    source: "https://commons.wikimedia.org/wiki/File:Calaguas_Island_beachfront.jpg",
  },
  parola: {
    file: "/images/daet/parola.jpg",
    alt: "A man walking along the sandbar of Parola Island",
    place: "Parola Island",
    title: "Sandbar in Parola Island",
    author: "Biag arnel",
    ...BY_SA,
    source: "https://commons.wikimedia.org/wiki/File:Sandbar_in_Parola_Island,_Daet,_Camarines_Norte,_Philippines.jpg",
  },
  apuao: {
    file: "/images/daet/apuao.jpg",
    alt: "Shallow lagoon and pine-fringed sand on Apuao Island",
    place: "Apuao Island",
    title: "Apuao Island, Mercedes",
    author: "Monette Nyem",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0",
    source: "https://commons.wikimedia.org/wiki/File:Apuao_Island,_Mercedes,_Camarines_Norte,_Philippines_-_panoramio_(1).jpg",
  },
} satisfies Record<string, PhotoCredit>;
