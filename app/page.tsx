// Accueil "/" — galerie de la visite guidée (Server Component).
// Lit content.json (ordre d'insertion = artefact-01..10) + la présence des mp3,
// puis délègue le rendu (QR live, bannière BASE_URL) au composant client Gallery.

import { allIds, getEntry } from "@/lib/content";
import { langsWithAudio } from "@/lib/audio";
import { DEFAULT_LANG, DEFAULT_CATEGORY } from "@/lib/schema";
import Gallery, { type GalleryItem } from "./Gallery";

export default function Home() {
  const items: GalleryItem[] = allIds().map((id, i) => {
    const entry = getEntry(id);
    return {
      id,
      n: i + 1,
      title: entry?.title?.[DEFAULT_LANG] ?? "",
      audioLangs: langsWithAudio(id),
      category: entry?.category ?? DEFAULT_CATEGORY,
    };
  });

  return <Gallery items={items} />;
}
