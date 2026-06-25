// lib/audio.ts — Présence des mp3 pré-générés (server-only).
//
// Lit public/audio/ pour savoir quelles langues ont un audio. La prod ne sert que
// ces mp3 statiques (versionnés) : c'est la source de vérité des badges de la galerie.
// Rendu en Server Component → exécuté au build (statique) et re-évalué à chaque
// requête en dev (reflète les mp3 fraîchement générés via l'admin).

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { LANGS, type Lang } from "@/lib/schema";

const AUDIO_DIR = join(process.cwd(), "public", "audio");

function presentSet(): Set<string> {
  try {
    return new Set(
      readdirSync(AUDIO_DIR)
        .filter((f) => f.endsWith(".mp3"))
        .map((f) => f.replace(/\.mp3$/, "")),
    );
  } catch {
    return new Set(); // dossier absent = aucun audio encore généré
  }
}

/** Langues (dans l'ordre LANGS) dont le mp3 <id>-<lang>.mp3 existe. */
export function langsWithAudio(id: string): Lang[] {
  const present = presentSet();
  return LANGS.filter((l) => present.has(`${id}-${l}`));
}
