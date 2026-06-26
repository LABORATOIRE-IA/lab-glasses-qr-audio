// app/api/admin/content/route.ts — API LOCALE d'édition de content/content.json.
//
// ⚠️ USAGE LOCAL UNIQUEMENT (npm run dev). Cette route LIT/ÉCRIT un fichier du repo :
//    le workflow est « éditer en local → commit/push → déployer ». En production
//    (Vercel), le système de fichiers est en lecture seule / éphémère : la route est
//    explicitement DÉSACTIVÉE (403) par prodGuard(). Elle ne doit JAMAIS être appelée
//    en prod. Aucun secret, aucun appel ElevenLabs ici.

import { NextResponse } from "next/server";
import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import {
  isValidSlug,
  DEFAULT_TTS,
  DEFAULT_CATEGORY,
  type Category,
  type Entry,
} from "@/lib/schema";

const CONTENT_PATH = join(process.cwd(), "content", "content.json");
const LANGS = ["fr", "en", "es", "de"] as const;

// Empêche toute écriture en prod (fs lecture seule + sécurité).
function prodGuard() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Admin désactivée en production : édition locale uniquement." },
      { status: 403 },
    );
  }
  return null;
}

async function readContent(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(CONTENT_PATH, "utf8"));
}

// Écriture atomique : fichier temporaire puis rename. JSON indenté 2 espaces +
// newline final -> diffs git propres.
async function writeContent(data: Record<string, unknown>): Promise<void> {
  const json = JSON.stringify(data, null, 2) + "\n";
  const tmp = CONTENT_PATH + ".tmp";
  await writeFile(tmp, json, "utf8");
  await rename(tmp, CONTENT_PATH);
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// Reconstruit une entrée propre depuis l'input (ignore tout champ parasite).
function sanitizeEntry(input: unknown): Entry {
  const o = (input ?? {}) as Record<string, unknown>;
  const pickLangs = (m: unknown): Record<string, string> => {
    const src = (m ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const l of LANGS) out[l] = typeof src[l] === "string" ? (src[l] as string) : "";
    return out;
  };
  const tts = (o.tts ?? {}) as Record<string, unknown>;
  const vs = (tts.voice_settings ?? {}) as Record<string, unknown>;
  const category: Category =
    o.category === "livre_blanc" || o.category === "experience"
      ? o.category
      : DEFAULT_CATEGORY;
  return {
    category,
    title: pickLangs(o.title),
    text: pickLangs(o.text),
    tts: {
      voice_id:
        typeof tts.voice_id === "string" && tts.voice_id
          ? tts.voice_id
          : DEFAULT_TTS.voice_id,
      model_id:
        typeof tts.model_id === "string" && tts.model_id
          ? tts.model_id
          : DEFAULT_TTS.model_id,
      voice_settings: {
        stability: clamp01(num(vs.stability, DEFAULT_TTS.voice_settings.stability)),
        similarity_boost: clamp01(
          num(vs.similarity_boost, DEFAULT_TTS.voice_settings.similarity_boost),
        ),
      },
    },
  };
}

// GET : renvoie tout le contenu (l'admin filtre les clés méta '_').
export async function GET() {
  const guard = prodGuard();
  if (guard) return guard;
  const content = await readContent();
  return NextResponse.json({ content });
}

// POST : créer une nouvelle expérience (id unique, slug valide).
export async function POST(req: Request) {
  const guard = prodGuard();
  if (guard) return guard;

  const { id, entry } = await req.json();
  if (!isValidSlug(id)) {
    return NextResponse.json(
      { error: "id invalide : slug minuscules/chiffres/tirets requis (ex. reachy)." },
      { status: 400 },
    );
  }
  const content = await readContent();
  if (id in content) {
    return NextResponse.json(
      { error: `L'id « ${id} » existe déjà.` },
      { status: 409 },
    );
  }
  content[id] = sanitizeEntry(entry);
  await writeContent(content);
  return NextResponse.json({ ok: true, id });
}

// PUT : modifier une expérience existante.
export async function PUT(req: Request) {
  const guard = prodGuard();
  if (guard) return guard;

  const { id, entry } = await req.json();
  const content = await readContent();
  if (!(id in content) || id.startsWith("_")) {
    return NextResponse.json(
      { error: `Id introuvable : ${id}` },
      { status: 404 },
    );
  }
  content[id] = sanitizeEntry(entry);
  await writeContent(content);
  return NextResponse.json({ ok: true, id });
}

// DELETE : supprimer une expérience (?id=...).
export async function DELETE(req: Request) {
  const guard = prodGuard();
  if (guard) return guard;

  const id = new URL(req.url).searchParams.get("id");
  if (!id || id.startsWith("_")) {
    return NextResponse.json({ error: "id manquant." }, { status: 400 });
  }
  const content = await readContent();
  if (!(id in content)) {
    return NextResponse.json({ error: `Id introuvable : ${id}` }, { status: 404 });
  }
  delete content[id];
  await writeContent(content);
  return NextResponse.json({ ok: true, id });
}
