"use client";

// AdminClient — gestion locale du CONTENU TEXTE (lit/écrit content.json via l'API).
// Pas de TTS, pas de QR, pas d'ElevenLabs : le bloc tts est seulement stocké/édité.
// Les données affichées viennent de l'API (état réel du fichier), pas du bundle.

import { useEffect, useState } from "react";
import {
  LANGS,
  DEFAULT_LANG,
  emptyEntry,
  isValidSlug,
  type Entry,
  type Lang,
} from "@/lib/schema";

type ContentMap = Record<string, Entry>;

const LANG_LABEL: Record<Lang, string> = {
  fr: "FR",
  en: "EN",
  es: "ES",
  de: "DE",
};

// Une langue est "complète" si son texte (la matière du TTS) est non vide.
function isLangComplete(entry: Entry, lang: Lang): boolean {
  return (entry.text?.[lang] ?? "").trim() !== "";
}

export default function AdminClient() {
  const [content, setContent] = useState<ContentMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<
    { id: string; draft: Entry; isNew: boolean } | null
  >(null);
  const [saving, setSaving] = useState(false);

  async function load() {
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
      setError(`Chargement impossible : ${(e as Error).message}`);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startAdd() {
    setEditing({ id: "", draft: emptyEntry(), isNew: true });
  }

  function startEdit(id: string) {
    if (!content) return;
    // copie profonde simple pour éditer sans muter l'état liste
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
      await load();
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
      await load();
    } catch (e) {
      setError(`Enregistrement impossible : ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin — contenu</h1>
          <p className="text-sm text-neutral-500">
            Édition locale de{" "}
            <code className="rounded bg-neutral-200 px-1">content/content.json</code>.
            Commit/push pour déployer.
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
              <th className="py-2 text-center">Complétude</th>
              <th className="py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(content).map(([id, entry]) => (
              <tr key={id} className="border-b">
                <td className="py-2 font-mono">{id}</td>
                <td className="py-2">
                  {entry.title?.[DEFAULT_LANG] || (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
                <td className="py-2">
                  <div className="flex justify-center gap-1">
                    {LANGS.map((l) => {
                      const ok = isLangComplete(entry, l);
                      return (
                        <span
                          key={l}
                          title={`${LANG_LABEL[l]} ${ok ? "complet" : "vide"}`}
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
                <td className="py-2 text-right">
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
          onChange={setEditing}
          onCancel={() => {
            setEditing(null);
            setError(null);
          }}
          onSave={save}
        />
      )}
    </main>
  );
}

// ───────────────────────────── Éditeur ─────────────────────────────

function Editor({
  state,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  state: { id: string; draft: Entry; isNew: boolean };
  saving: boolean;
  onChange: (s: { id: string; draft: Entry; isNew: boolean }) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { id, draft, isNew } = state;

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

  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">
          {isNew ? "Ajouter une expérience" : `Éditer « ${id} »`}
        </h2>

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

        {/* titre + texte par langue */}
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
          </fieldset>
        ))}

        {/* bloc TTS — stocké uniquement, aucune génération à cette étape */}
        <fieldset className="mb-4 rounded-lg border border-neutral-200 p-3">
          <legend className="px-1 text-sm font-semibold">
            TTS (stocké — pas de génération ici)
          </legend>
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
            Annuler
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
