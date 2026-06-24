#!/usr/bin/env node
/**
 * scripts/migrate-content.mjs — Migration du schéma content/content.json.
 *
 * AVANT (Phase 1) :
 *   "artefact-01": { "title": "Bienvenue", "lang": { fr,en,es,de } }
 * APRÈS :
 *   "artefact-01": {
 *     "title": { fr,en,es,de },   // l'ancien title (neutre/fr) -> title.fr
 *     "text":  { fr,en,es,de },   // ancien "lang" -> "text"
 *     "tts":   { voice_id, model_id, voice_settings { stability, similarity_boost } }
 *   }
 *
 * Sans perte : les vrais textes déjà saisis sont mappés. Idempotent : une entrée déjà
 * au nouveau format est conservée telle quelle. voice_id/model_id repris de pipeline/.env
 * (la CLÉ n'est PAS lue ni touchée). Écriture atomique, JSON indenté 2 espaces.
 *
 * Usage :
 *   node scripts/migrate-content.mjs --entry artefact-01 --dry-run   # aperçu avant/après, aucun write
 *   node scripts/migrate-content.mjs                                 # applique aux 10 (écrit le fichier)
 */

import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "content", "content.json");
const ENV = join(ROOT, "pipeline", ".env");
const LANGS = ["fr", "en", "es", "de"];

// Lit UNE variable de pipeline/.env (jamais la clé API). Fallback si absente.
function readEnvVal(name, fallback) {
  if (!existsSync(ENV)) return fallback;
  for (const line of readFileSync(ENV, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] === name) {
      let v = m[2];
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      return v || fallback;
    }
  }
  return fallback;
}

const VOICE_ID = readEnvVal("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM");
const MODEL_ID = readEnvVal("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2");

const NEW_SCHEMA_DOC = {
  description:
    "Source de vérité du contenu. Chaque clé hors '_schema' est un id d'artefact (slug), " +
    "encodé dans un QR via <BASE_URL>/play/<id>. Un seul QR par artefact sert toutes les langues.",
  entry: {
    title: "Titre par langue { fr, en, es, de } — affiché sur la page visiteur.",
    text: "Texte lu par langue { fr, en, es, de } — source des mp3 TTS pré-générés.",
    tts: "Réglages ElevenLabs (voice_id, model_id, voice_settings). Stocké ici ; utilisé par le script de génération LOCAL, jamais en prod.",
  },
  id_format: "slug minuscules / chiffres / tirets (ex. artefact-01, reachy).",
};

function isAlreadyNew(e) {
  return (
    !!e &&
    typeof e === "object" &&
    e.text &&
    typeof e.text === "object" &&
    e.title &&
    typeof e.title === "object"
  );
}

function migrateEntry(old) {
  if (isAlreadyNew(old)) return old; // idempotent

  const oldTitle = typeof old?.title === "string" ? old.title : "";
  const oldLang = old?.lang && typeof old.lang === "object" ? old.lang : {};

  const title = { fr: "", en: "", es: "", de: "" };
  title.fr = oldTitle; // l'ancien titre était neutre / fr

  const text = {};
  for (const l of LANGS) {
    text[l] = typeof oldLang[l] === "string" ? oldLang[l] : "";
  }

  return {
    title,
    text,
    tts: {
      voice_id: VOICE_ID,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    },
  };
}

// --- main ---
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const entryArg = (() => {
  const i = args.indexOf("--entry");
  return i >= 0 ? args[i + 1] : null;
})();

const data = JSON.parse(readFileSync(CONTENT, "utf8"));

const out = { _schema: NEW_SCHEMA_DOC };
for (const [k, v] of Object.entries(data)) {
  if (k.startsWith("_")) continue;
  out[k] = migrateEntry(v);
}

if (entryArg) {
  if (!(entryArg in data)) {
    console.error(`Id inconnu: ${entryArg}`);
    process.exit(1);
  }
  console.log(`──────── AVANT (${entryArg}) ────────`);
  console.log(JSON.stringify({ [entryArg]: data[entryArg] }, null, 2));
  console.log(`\n──────── APRÈS (${entryArg}) ────────`);
  console.log(JSON.stringify({ [entryArg]: out[entryArg] }, null, 2));
}

if (dryRun) {
  console.log("\n(dry-run : aucun fichier écrit.)");
  process.exit(0);
}

const json = JSON.stringify(out, null, 2) + "\n";
const tmp = CONTENT + ".tmp";
writeFileSync(tmp, json, "utf8"); // écriture atomique : temp puis rename
renameSync(tmp, CONTENT);
const count = Object.keys(out).filter((k) => !k.startsWith("_")).length;
console.log(`✅ content.json migré (${count} entrées) → ${CONTENT}`);
