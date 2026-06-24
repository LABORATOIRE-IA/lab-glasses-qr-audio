// lib/schema.ts — Schéma du contenu + constantes, SANS import de content.json.
// Réutilisable côté serveur (visitor page, API route) ET client (admin) sans
// embarquer le JSON dans le bundle.

export type Lang = "fr" | "en" | "es" | "de";

/** Langues proposées (ordre d'affichage). FR par défaut. */
export const LANGS: Lang[] = ["fr", "en", "es", "de"];
export const DEFAULT_LANG: Lang = "fr";

export interface TtsVoiceSettings {
  stability: number;
  similarity_boost: number;
}

export interface Tts {
  voice_id: string;
  model_id: string;
  voice_settings: TtsVoiceSettings;
}

/** Une entrée artefact (nouveau schéma) : titre + texte par langue + réglages TTS. */
export interface Entry {
  title: Record<string, string>;
  text: Record<string, string>;
  tts: Tts;
}

/** Défauts TTS (voice_id repris de pipeline/.env ; non secret). Stocké, pas appelé ici. */
export const DEFAULT_TTS: Tts = {
  voice_id: "21m00Tcm4TlvDq8ikWAM",
  model_id: "eleven_multilingual_v2",
  voice_settings: { stability: 0.5, similarity_boost: 0.75 },
};

// slug : minuscules / chiffres / tirets ; pas de tiret en tête ou fin ; pas de '_'
// (réservé aux clés méta comme _schema).
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(s: string): boolean {
  return typeof s === "string" && SLUG_RE.test(s) && !s.startsWith("_");
}

/** Entrée vide conforme au schéma (pour le formulaire « Ajouter »). */
export function emptyEntry(): Entry {
  return {
    title: { fr: "", en: "", es: "", de: "" },
    text: { fr: "", en: "", es: "", de: "" },
    tts: {
      voice_id: DEFAULT_TTS.voice_id,
      model_id: DEFAULT_TTS.model_id,
      voice_settings: { ...DEFAULT_TTS.voice_settings },
    },
  };
}
