#!/usr/bin/env node
/**
 * scripts/generate-audio.mjs — Génération LOCALE des mp3 (ElevenLabs TTS).
 *
 * ⚠️ LOCAL UNIQUEMENT. Ce script lit la clé ElevenLabs (.env.local) et appelle l'API.
 *    La PROD ne sert que les mp3 statiques de public/audio/ — AUCUNE clé, AUCUN appel
 *    ElevenLabs au runtime. Ne mets JAMAIS ELEVENLABS_API_KEY dans Vercel.
 *
 * Logique portée fidèlement de la Phase 1 (tag git `phase1-pipeline`,
 * pipeline/qr_audio_pipeline.py) :
 *   - modèle eleven_multilingual_v2 (voice_id / model_id surchargés via .env.local) ;
 *   - normalisation de prononciation depuis pipeline/pronunciations.json, appliquée au
 *     TEXTE juste avant l'appel (remplacement MOT ENTIER, SENSIBLE À LA CASSE) ;
 *   - corps de requête { text, model_id }, en-têtes xi-api-key / Accept: audio/mpeg.
 *
 * Sortie : public/audio/<id>-<lang>.mp3 (saute si déjà présent, sauf --force).
 *
 * Usage :
 *   node --env-file=.env.local scripts/generate-audio.mjs                  # tout (10×4), saute l'existant
 *   node --env-file=.env.local scripts/generate-audio.mjs --id artefact-01 --lang fr
 *   node --env-file=.env.local scripts/generate-audio.mjs --force          # régénère tout
 *   (le script charge aussi .env.local tout seul si --env-file est omis)
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_JSON = join(ROOT, "content", "content.json");
const PRONUNCIATIONS_JSON = join(ROOT, "pipeline", "pronunciations.json");
const OUT_DIR = join(ROOT, "public", "audio");
const ENV_LOCAL = join(ROOT, ".env.local");

const TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // "Rachel", multilingue
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const LANGS = ["fr", "en", "es", "de"];

// --- Charge .env.local sans dépendance (no-op si la var est déjà dans l'env) ---
function loadEnvLocal() {
  if (!existsSync(ENV_LOCAL)) return;
  for (const line of readFileSync(ENV_LOCAL, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key] = m;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvLocal();

// --- Arguments ---
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const force = has("--force");
const onlyId = valueOf("--id");
const onlyLang = valueOf("--lang");

// --- Données ---
const content = JSON.parse(readFileSync(CONTENT_JSON, "utf8"));
const pron = existsSync(PRONUNCIATIONS_JSON)
  ? JSON.parse(readFileSync(PRONUNCIATIONS_JSON, "utf8"))
  : {};

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalisation de prononciation : mot entier, SENSIBLE À LA CASSE (cf. Phase 1). */
function normalizePronunciation(text) {
  for (const [key, value] of Object.entries(pron)) {
    if (key.startsWith("_")) continue; // clés méta (_comment…)
    text = text.replace(new RegExp(`\\b${escapeRegExp(key)}\\b`, "g"), value);
  }
  return text;
}

const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID;

async function synthesize(text) {
  if (!apiKey) {
    console.error(
      "❌ ELEVENLABS_API_KEY manquante. Renseigne-la dans .env.local (LOCAL uniquement).",
    );
    process.exit(1);
  }
  const resp = await fetch(`${TTS_URL}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text, model_id: modelId }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`ElevenLabs ${resp.status}: ${body.slice(0, 300)}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const ids = Object.keys(content).filter((k) => !k.startsWith("_"));
  const targetIds = onlyId ? [onlyId] : ids;
  const targetLangs = onlyLang ? [onlyLang] : LANGS;

  console.log(
    `🎙️  voice=${voiceId} model=${modelId} — cible: ${targetIds.length} id(s) × ${targetLangs.length} langue(s)`,
  );

  let made = 0;
  let skipped = 0;
  for (const id of targetIds) {
    const entry = content[id];
    if (!entry || typeof entry !== "object" || !entry.lang) {
      console.error(`⚠️  id inconnu: ${id} (ignoré)`);
      continue;
    }
    for (const lang of targetLangs) {
      const raw = entry.lang[lang];
      if (!raw) {
        console.error(`⚠️  pas de texte ${id}/${lang} (ignoré)`);
        continue;
      }
      const out = join(OUT_DIR, `${id}-${lang}.mp3`);
      if (existsSync(out) && !force) {
        console.log(`🗄️  skip (existe): ${id}-${lang}.mp3`);
        skipped++;
        continue;
      }
      const spoken = normalizePronunciation(raw);
      process.stdout.write(`🔊 ${id}-${lang} … `);
      const buf = await synthesize(spoken);
      writeFileSync(out, buf);
      console.log(`💾 ${buf.length} octets`);
      made++;
    }
  }

  console.log(
    `\n✅ Terminé : ${made} généré(s), ${skipped} sauté(s) → public/audio/`,
  );
  console.log(
    "🔒 Rappel sécu : ces mp3 sont servis en statique en prod. Aucune clé ElevenLabs en prod.",
  );
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
