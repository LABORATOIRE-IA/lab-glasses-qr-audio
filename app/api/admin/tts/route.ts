// app/api/admin/tts/route.ts — Génération audio ElevenLabs, LOCALE uniquement.
//
// ⚠️ La clé ELEVENLABS_API_KEY (.env.local) n'est lue QUE par cette route serveur :
//    jamais exposée au client, jamais requise en prod. prodGuard() renvoie 403 en
//    production (génération = local uniquement). La prod ne sert que des mp3 statiques.
//
//  POST { id, lang, force? } → lit texte + bloc tts de content.json, normalise la
//    prononciation (pipeline/pronunciations.json, logique Phase 1), appelle ElevenLabs,
//    écrit public/audio/<id>-<lang>.mp3 (atomique). Cache : ne régénère pas si le mp3
//    existe, sauf force.
//  GET → { present } : map des mp3 déjà présents ("<id>-<lang>": true), pour les
//    indicateurs de l'admin.

import { NextResponse } from "next/server";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { LANGS, DEFAULT_TTS, type Lang } from "@/lib/schema";

const CONTENT_PATH = join(process.cwd(), "content", "content.json");
const PRON_PATH = join(process.cwd(), "pipeline", "pronunciations.json");
const AUDIO_DIR = join(process.cwd(), "public", "audio");
const TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

function prodGuard() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Génération désactivée en production : local uniquement." },
      { status: 403 },
    );
  }
  return null;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Normalisation portée FIDÈLEMENT de la Phase 1 : remplacement MOT ENTIER (\bCLE\b),
// SENSIBLE À LA CASSE (pas de flag i). Ex. "IA" -> "I.A." ; clés méta '_' ignorées.
async function normalizePronunciation(text: string): Promise<string> {
  let table: Record<string, unknown> = {};
  try {
    table = JSON.parse(await readFile(PRON_PATH, "utf8"));
  } catch {
    return text; // pas de table -> texte inchangé
  }
  for (const [key, value] of Object.entries(table)) {
    if (key.startsWith("_")) continue;
    text = text.replace(
      new RegExp(`\\b${escapeRegExp(key)}\\b`, "g"),
      String(value),
    );
  }
  return text;
}

// GET : quels mp3 sont déjà présents dans public/audio.
export async function GET() {
  const guard = prodGuard();
  if (guard) return guard;

  const present: Record<string, boolean> = {};
  try {
    for (const f of await readdir(AUDIO_DIR)) {
      if (f.endsWith(".mp3")) present[f.replace(/\.mp3$/, "")] = true;
    }
  } catch {
    // dossier absent = aucun audio encore généré
  }
  return NextResponse.json({ present });
}

// POST : génère (ou réutilise le cache) l'audio d'une (id, lang).
export async function POST(req: Request) {
  const guard = prodGuard();
  if (guard) return guard;

  const { id, lang, force } = (await req.json()) as {
    id: string;
    lang: Lang;
    force?: boolean;
  };

  if (!LANGS.includes(lang)) {
    return NextResponse.json({ ok: false, error: "Langue invalide." }, { status: 400 });
  }

  const content = JSON.parse(await readFile(CONTENT_PATH, "utf8"));
  const entry = content[id];
  if (!entry || id.startsWith("_")) {
    return NextResponse.json(
      { ok: false, error: `Id introuvable : ${id}` },
      { status: 404 },
    );
  }

  const text = (entry.text?.[lang] ?? "").trim();
  if (!text) {
    return NextResponse.json(
      { ok: false, error: `Texte vide pour ${lang} : rien à synthétiser.` },
      { status: 400 },
    );
  }

  const out = join(AUDIO_DIR, `${id}-${lang}.mp3`);
  if (!force && (await fileExists(out))) {
    return NextResponse.json({
      ok: true,
      status: "cached",
      file: `${id}-${lang}.mp3`,
    });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "ELEVENLABS_API_KEY manquante (.env.local, local uniquement)." },
      { status: 500 },
    );
  }

  const tts = entry.tts ?? {};
  const voiceId = tts.voice_id || DEFAULT_TTS.voice_id;
  const modelId = tts.model_id || DEFAULT_TTS.model_id;
  const voiceSettings = tts.voice_settings ?? DEFAULT_TTS.voice_settings;

  const spoken = await normalizePronunciation(text);

  let resp: Response;
  try {
    resp = await fetch(`${TTS_URL}/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: spoken,
        model_id: modelId,
        voice_settings: voiceSettings,
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Réseau ElevenLabs : ${(e as Error).message}` },
      { status: 502 },
    );
  }

  if (!resp.ok) {
    const body = await resp.text();
    const hint =
      resp.status === 401
        ? " (clé invalide ou permission text_to_speech manquante)"
        : "";
    return NextResponse.json(
      { ok: false, error: `ElevenLabs ${resp.status}${hint} : ${body.slice(0, 300)}` },
      { status: 502 },
    );
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  await mkdir(AUDIO_DIR, { recursive: true });
  const tmp = out + ".tmp"; // écriture atomique
  await writeFile(tmp, buf);
  await rename(tmp, out);

  return NextResponse.json({
    ok: true,
    status: force ? "regenerated" : "generated",
    file: `${id}-${lang}.mp3`,
    bytes: buf.length,
  });
}
