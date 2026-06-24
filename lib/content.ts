// lib/content.ts — Accès typé à content/content.json (SOURCE DE VÉRITÉ UNIQUE).
//
// content.json est importé directement (bundlé au build) : aucune lecture disque au
// runtime côté visiteur. Les clés préfixées '_' (ex. _schema) sont des métadonnées.
// L'écriture passe par l'API admin (app/api/admin/content), jamais ici.

import contentJson from "@/content/content.json";
import type { Entry } from "@/lib/schema";

export { LANGS, DEFAULT_LANG } from "@/lib/schema";
export type { Entry, Lang, Tts, TtsVoiceSettings } from "@/lib/schema";

const raw = contentJson as unknown as Record<string, unknown>;

function isEntry(v: unknown): v is Entry {
  return (
    !!v &&
    typeof v === "object" &&
    "title" in v &&
    "text" in v &&
    typeof (v as Entry).text === "object"
  );
}

/** Retourne l'entrée pour un id, ou null si inconnu / métadonnée. */
export function getEntry(id: string): Entry | null {
  if (!id || id.startsWith("_")) return null;
  const v = raw[id];
  return isEntry(v) ? v : null;
}

/** Liste des ids d'artefacts (hors métadonnées '_...'). */
export function allIds(): string[] {
  return Object.keys(raw).filter((k) => !k.startsWith("_"));
}
