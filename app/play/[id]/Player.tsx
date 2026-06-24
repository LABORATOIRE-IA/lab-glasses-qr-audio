"use client";

// Player — boutons de langue + lecteur tap-to-play.
// L'autoplay mobile est bloqué par les navigateurs : c'est VOLONTAIRE, le visiteur
// doit toucher « ▶ Écouter » (geste utilisateur requis pour router le son vers les
// haut-parleurs des lunettes via Bluetooth).
// Le mp3 est servi en statique depuis /public/audio/<id>-<lang>.mp3 (pré-généré en
// local). Aucun appel TTS au runtime.

import { useRef, useState } from "react";
import { DEFAULT_LANG, LANGS, type Lang } from "@/lib/content";

const LABELS: Record<Lang, string> = { fr: "FR", en: "EN", es: "ES", de: "DE" };

export default function Player({
  id,
  titles,
  texts,
}: {
  id: string;
  titles: Record<string, string>;
  texts: Record<string, string>;
}) {
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const src = `/audio/${id}-${lang}.mp3`;
  const title = titles[lang] ?? titles[DEFAULT_LANG] ?? "";
  const text = texts[lang] ?? texts[DEFAULT_LANG] ?? "";

  function choose(l: Lang) {
    setLang(l);
    setError(null);
    setPlaying(false);
  }

  async function play() {
    setError(null);
    const a = audioRef.current;
    if (!a) return;
    try {
      await a.play();
    } catch {
      // Échec geste/lecture : message clair, on invite à retoucher le bouton.
      setError("Lecture impossible. Touchez à nouveau « ▶ Écouter ».");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-between gap-8 p-6">
      <header className="w-full pt-6 text-center">
        <p className="text-xs uppercase tracking-widest text-neutral-400">
          Agentic Livepoint
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
      </header>

      {/* Choix de la langue */}
      <div
        className="flex gap-2"
        role="group"
        aria-label="Choix de la langue"
      >
        {LANGS.map((l) => {
          const active = l === lang;
          return (
            <button
              key={l}
              type="button"
              onClick={() => choose(l)}
              aria-pressed={active}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
              }`}
            >
              {LABELS[l]}
            </button>
          );
        })}
      </div>

      {/* Texte lu (read-along) */}
      <p className="text-center text-base leading-relaxed text-neutral-600">
        {text}
      </p>

      {/* Lecteur tap-to-play */}
      <div className="flex w-full flex-col items-center gap-4 pb-8">
        <button
          type="button"
          onClick={play}
          className="flex h-44 w-44 items-center justify-center rounded-full bg-neutral-900 text-2xl font-semibold text-white shadow-lg transition active:scale-95"
        >
          {playing ? "⏸ Lecture…" : "▶ Écouter"}
        </button>

        {error && (
          <p className="text-center text-sm font-medium text-red-600">{error}</p>
        )}

        {/* key={src} -> remonte l'élément quand la langue change (recharge le bon mp3). */}
        <audio
          key={src}
          ref={audioRef}
          src={src}
          preload="none"
          onPlaying={() => setPlaying(true)}
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
          onError={() =>
            setError("Audio indisponible pour cette langue (mp3 manquant).")
          }
        />
      </div>
    </main>
  );
}
