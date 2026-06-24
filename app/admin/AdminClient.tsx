"use client";

// AdminClient — gestion locale du CONTENU TEXTE + génération audio (par clip).
// Le texte lit/écrit content.json via /api/admin/content. L'audio est généré via
// /api/admin/tts (clé serveur uniquement). Pas de QR ici, pas de « tout générer ».

import { useCallback, useEffect, useState } from "react";
import {
  LANGS,
  DEFAULT_LANG,
  emptyEntry,
  isValidSlug,
  type Entry,
  type Lang,
} from "@/lib/schema";

type ContentMap = Record<string, Entry>;
type AudioMap = Record<string, boolean>; // clé "<id>-<lang>"

const LANG_LABEL: Record<Lang, string> = {
  fr: "FR",
  en: "EN",
  es: "ES",
  de: "DE",
};

const audioKey = (id: string, lang: Lang) => `${id}-${lang}`;

// Une langue est "complète" (texte) si son texte est non vide.
function isLangComplete(entry: Entry, lang: Lang): boolean {
  return (entry.text?.[lang] ?? "").trim() !== "";
}

export default function AdminClient() {
  const [content, setContent] = useState<ContentMap | null>(null);
  const [audio, setAudio] = useState<AudioMap>({});
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<
    { id: string; draft: Entry; isNew: boolean } | null
  >(null);
  const [saving, setSaving] = useState(false);

  const loadContent = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/content");
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      const { content } = await res.json();
      const map: ContentMap = {};
      for (const [k, v] of Object.entries(content as Record<string, Entry>)) {
        if (!k.startsWith("_")) map[k] = v;
      }
      setContent(map);
    } catch (e) {
      setError(`Chargement contenu impossible : ${(e as Error).message}`);
    }
  }, []);

  const loadAudio = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tts");
      if (!res.ok) return;
      const { present } = await res.json();
      setAudio(present ?? {});
    } catch {
      // silencieux : l'indicateur audio est secondaire
    }
  }, []);

  useEffect(() => {
    loadContent();
    loadAudio();
  }, [loadContent, loadAudio]);

  function startAdd() {
    setEditing({ id: "", draft: emptyEntry(), isNew: true });
  }

  function startEdit(id: string) {
    if (!content) return;
    const draft = JSON.parse(JSON.stringify(content[id])) as Entry;
    setEditing({ id, draft, isNew: false });
  }

  async function remove(id: string) {
    if (!confirm(`Supprimer l'expérience « ${id} » ? Action définitive.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/content?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      await loadContent();
    } catch (e) {
      setError(`Suppression impossible : ${(e as Error).message}`);
    }
  }

  async function save() {
    if (!editing) return;
    const { id, draft, isNew } = editing;
    if (isNew && !isValidSlug(id)) {
      setError("id invalide : minuscules / chiffres / tirets (ex. reachy).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/content", {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, entry: draft }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      setEditing(null);
      await loadContent();
    } catch (e) {
      setError(`Enregistrement impossible : ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  // Marque un mp3 comme présent (après génération réussie).
  const markAudioPresent = useCallback((id: string, lang: Lang) => {
    setAudio((prev) => ({ ...prev, [audioKey(id, lang)]: true }));
  }, []);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin — contenu &amp; audio</h1>
          <p className="text-sm text-neutral-500">
            Édition locale de{" "}
            <code className="rounded bg-neutral-200 px-1">content/content.json</code>{" "}
            + génération audio (clé serveur, local uniquement). Commit/push pour déployer.
          </p>
        </div>
        <button
          type="button"
          onClick={startAdd}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
        >
          + Ajouter
        </button>
      </header>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {!content ? (
        <p className="text-neutral-500">Chargement…</p>
      ) : Object.keys(content).length === 0 ? (
        <p className="text-neutral-500">Aucune expérience. Clique « + Ajouter ».</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-neutral-500">
              <th className="py-2">id</th>
              <th className="py-2">Titre (FR)</th>
              <th className="py-2 text-center">Texte</th>
              <th className="py-2 text-center">Audio</th>
              <th className="py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(content).map(([id, entry]) => (
              <tr key={id} className="border-b align-top">
                <td className="py-2 font-mono">{id}</td>
                <td className="py-2">
                  {entry.title?.[DEFAULT_LANG] || (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
                {/* complétude texte */}
                <td className="py-2">
                  <div className="flex justify-center gap-1">
                    {LANGS.map((l) => {
                      const ok = isLangComplete(entry, l);
                      return (
                        <span
                          key={l}
                          title={`Texte ${LANG_LABEL[l]} : ${ok ? "présent" : "vide"}`}
                          className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                            ok
                              ? "bg-green-100 text-green-700"
                              : "bg-neutral-100 text-neutral-400"
                          }`}
                        >
                          {LANG_LABEL[l]} {ok ? "✓" : "✗"}
                        </span>
                      );
                    })}
                  </div>
                </td>
                {/* présence audio */}
                <td className="py-2">
                  <div className="flex justify-center gap-1">
                    {LANGS.map((l) => {
                      const has = !!audio[audioKey(id, l)];
                      return (
                        <span
                          key={l}
                          title={`Audio ${LANG_LABEL[l]} : ${has ? "généré" : "manquant"}`}
                          className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                            has
                              ? "bg-blue-100 text-blue-700"
                              : "bg-neutral-100 text-neutral-400"
                          }`}
                        >
                          {LANG_LABEL[l]} {has ? "🔊" : "—"}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => startEdit(id)}
                    className="mr-2 rounded border border-neutral-300 px-3 py-1 font-medium hover:bg-neutral-100"
                  >
                    Éditer
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(id)}
                    className="rounded border border-red-300 px-3 py-1 font-medium text-red-600 hover:bg-red-50"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <Editor
          state={editing}
          saving={saving}
          audio={audio}
          onChange={setEditing}
          onCancel={() => {
            setEditing(null);
            setError(null);
          }}
          onSave={save}
          onGenerated={markAudioPresent}
        />
      )}
    </main>
  );
}

// ───────────────────────────── Éditeur ─────────────────────────────

type GenStatus = "idle" | "loading" | "ok" | "err";

function Editor({
  state,
  saving,
  audio,
  onChange,
  onCancel,
  onSave,
  onGenerated,
}: {
  state: { id: string; draft: Entry; isNew: boolean };
  saving: boolean;
  audio: AudioMap;
  onChange: (s: { id: string; draft: Entry; isNew: boolean }) => void;
  onCancel: () => void;
  onSave: () => void;
  onGenerated: (id: string, lang: Lang) => void;
}) {
  const { id, draft, isNew } = state;
  const [gen, setGen] = useState<Record<string, { status: GenStatus; msg?: string }>>(
    {},
  );

  const setId = (v: string) => onChange({ ...state, id: v });
  const setTitle = (lang: Lang, v: string) =>
    onChange({ ...state, draft: { ...draft, title: { ...draft.title, [lang]: v } } });
  const setText = (lang: Lang, v: string) =>
    onChange({ ...state, draft: { ...draft, text: { ...draft.text, [lang]: v } } });
  const setTts = (patch: Partial<Entry["tts"]>) =>
    onChange({ ...state, draft: { ...draft, tts: { ...draft.tts, ...patch } } });
  const setVoiceSettings = (patch: Partial<Entry["tts"]["voice_settings"]>) =>
    onChange({
      ...state,
      draft: {
        ...draft,
        tts: {
          ...draft.tts,
          voice_settings: { ...draft.tts.voice_settings, ...patch },
        },
      },
    });

  async function generate(lang: Lang, force: boolean) {
    setGen((g) => ({ ...g, [lang]: { status: "loading" } }));
    try {
      const res = await fetch("/api/admin/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, lang, force }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? res.statusText);
      }
      setGen((g) => ({ ...g, [lang]: { status: "ok", msg: data.status } }));
      onGenerated(id, lang);
    } catch (e) {
      setGen((g) => ({ ...g, [lang]: { status: "err", msg: (e as Error).message } }));
    }
  }

  function GenControls({ lang }: { lang: Lang }) {
    const present = !!audio[audioKey(id, lang)];
    const hasText = (draft.text[lang] ?? "").trim() !== "";
    const st = gen[lang]?.status ?? "idle";
    const loading = st === "loading";
    const disabled = isNew || !hasText || loading;

    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {!present ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => generate(lang, false)}
            className="rounded bg-neutral-900 px-3 py-1 font-semibold text-white disabled:opacity-40"
          >
            {loading ? "Génération…" : "Générer l'audio"}
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => generate(lang, true)}
            className="rounded border border-neutral-400 px-3 py-1 font-semibold disabled:opacity-40"
          >
            {loading ? "Régénération…" : "Régénérer"}
          </button>
        )}

        {/* état */}
        {st === "loading" && <span className="text-neutral-500">en cours…</span>}
        {st === "err" && <span className="text-red-600">erreur : {gen[lang]?.msg}</span>}
        {st !== "loading" && st !== "err" && present && (
          <span className="text-blue-700">généré ✓</span>
        )}
        {st !== "loading" && st !== "err" && !present && hasText && (
          <span className="text-neutral-400">manquant</span>
        )}

        {isNew && (
          <span className="text-neutral-400">
            (enregistre l&apos;expérience avant de générer)
          </span>
        )}
        {!isNew && !hasText && (
          <span className="text-neutral-400">(texte vide)</span>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold">
          {isNew ? "Ajouter une expérience" : `Éditer « ${id} »`}
        </h2>
        <p className="mb-4 text-xs text-neutral-500">
          La génération audio utilise le texte <strong>enregistré</strong> — enregistre
          tes modifications avant de générer.
        </p>

        {/* id */}
        <label className="mb-4 block">
          <span className="text-sm font-medium text-neutral-700">id (slug)</span>
          {isNew ? (
            <input
              value={id}
              onChange={(e) => setId(e.target.value.trim())}
              placeholder="ex. reachy"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono"
            />
          ) : (
            <span className="mt-1 block font-mono text-neutral-500">{id}</span>
          )}
          {isNew && id && !isValidSlug(id) && (
            <span className="text-xs text-red-600">
              minuscules / chiffres / tirets uniquement
            </span>
          )}
        </label>

        {/* titre + texte + génération par langue */}
        {LANGS.map((l) => (
          <fieldset key={l} className="mb-4 rounded-lg border border-neutral-200 p-3">
            <legend className="px-1 text-sm font-semibold">{LANG_LABEL[l]}</legend>
            <label className="block">
              <span className="text-xs text-neutral-500">Titre</span>
              <input
                value={draft.title[l] ?? ""}
                onChange={(e) => setTitle(l, e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
              />
            </label>
            <label className="mt-2 block">
              <span className="text-xs text-neutral-500">Texte (lu à voix haute)</span>
              <textarea
                value={draft.text[l] ?? ""}
                onChange={(e) => setText(l, e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
              />
            </label>
            <GenControls lang={l} />
          </fieldset>
        ))}

        {/* bloc TTS — réglages stockés */}
        <fieldset className="mb-4 rounded-lg border border-neutral-200 p-3">
          <legend className="px-1 text-sm font-semibold">Réglages TTS</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-neutral-500">voice_id</span>
              <input
                value={draft.tts.voice_id}
                onChange={(e) => setTts({ voice_id: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-neutral-500">model_id</span>
              <input
                value={draft.tts.model_id}
                onChange={(e) => setTts({ model_id: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-neutral-500">stability (0–1)</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={draft.tts.voice_settings.stability}
                onChange={(e) =>
                  setVoiceSettings({ stability: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-xs text-neutral-500">similarity_boost (0–1)</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={draft.tts.voice_settings.similarity_boost}
                onChange={(e) =>
                  setVoiceSettings({ similarity_boost: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
              />
            </label>
          </div>
        </fieldset>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100"
          >
            Fermer
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
