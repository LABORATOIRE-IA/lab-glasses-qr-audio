"use client";

// Player — lecture AUTOMATIQUE à l'arrivée, avec filet de secours tap-to-play.
//
// Comportement visé :
//  1. Au chargement, le mp3 de la langue active est préchargé (preload="auto").
//     Dès qu'il est prêt (canplaythrough), on attend ~1 s puis on lance la lecture.
//  2. Les navigateurs mobiles (iOS Safari surtout) bloquent souvent l'autoplay sans
//     geste : on enveloppe play() dans un try/catch. Si l'autoplay est refusé, on
//     affiche un gros bouton « ▶ Écouter » unique et centré. Une page n'est JAMAIS
//     muette sans contrôle visible.
//  3. Changement de langue : le tap sur le bouton de langue est un geste utilisateur,
//     donc on relance directement la lecture dans la nouvelle langue.
//  4. mp3 manquant : message clair, aucun crash, aucune tentative de lecture.
//
// Le mp3 est servi en statique depuis /public/audio/<id>-<lang>.mp3 (pré-généré en
// local). Aucun appel TTS au runtime.

import { useEffect, useRef, useState } from "react";
import OnepointLogo from "@/components/OnepointLogo";
import { DEFAULT_LANG, LANGS, type Lang } from "@/lib/content";

const LABELS: Record<Lang, string> = { fr: "FR", en: "EN", es: "ES", de: "DE" };
// Petit délai avant l'autoplay à l'arrivée (laisse la page s'afficher / le visiteur
// se poser). Les changements de langue, eux, jouent immédiatement (geste utilisateur).
const AUTOPLAY_DELAY_MS = 1000;

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
  const [ended, setEnded] = useState(false);
  const [blocked, setBlocked] = useState(false); // autoplay refusé → tap requis
  const [started, setStarted] = useState(false); // a déjà joué au moins une fois

  const audioRef = useRef<HTMLAudioElement>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTried = useRef(false); // une seule tentative d'autoplay par source
  const userInitiated = useRef(false); // true après un changement de langue

  const src = `/audio/${id}-${lang}.mp3`;
  const title = titles[lang] ?? titles[DEFAULT_LANG] ?? "";
  const text = texts[lang] ?? texts[DEFAULT_LANG] ?? "";

  // À chaque changement de source (arrivée + changement de langue) : on réarme.
  // `started` n'est PAS remis à zéro : une fois la visite lancée, un changement de
  // langue garde les contrôles compacts (pas de gros bouton qui réapparaît).
  useEffect(() => {
    autoTried.current = false;
    setError(null);
    setBlocked(false);
    setPlaying(false);
    setEnded(false);
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, [src]);

  // Tentative de lecture, robuste au refus d'autoplay (promesse rejetée).
  async function attemptPlay() {
    const a = audioRef.current;
    if (!a || error) return;
    try {
      await a.play();
      setBlocked(false); // l'audio est débloqué
    } catch {
      // iOS Safari & co : autoplay bloqué sans geste → on bascule sur le tap.
      setBlocked(true);
    }
  }

  // Le mp3 est prêt : on programme l'autoplay (une seule fois par source).
  function onCanPlayThrough() {
    if (autoTried.current) return;
    autoTried.current = true;
    const delay = userInitiated.current ? 0 : AUTOPLAY_DELAY_MS;
    autoTimer.current = setTimeout(attemptPlay, delay);
  }

  function choose(l: Lang) {
    if (l === lang) return;
    userInitiated.current = true; // geste utilisateur → autoplay autorisé, immédiat
    setLang(l); // remonte <audio> (key=src) → effet reset → canplaythrough → play
  }

  // Bouton compact (après la première lecture) : pause / reprendre / réécouter.
  function onPrimary() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      return;
    }
    if (ended) a.currentTime = 0;
    a.play().catch(() => setBlocked(true));
  }

  const primaryLabel = playing ? "⏸ Pause" : ended ? "↻ Réécouter" : "▶ Reprendre";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-between gap-8 p-6">
      <header className="w-full pt-8 text-center">
        <div className="flex items-center justify-center gap-2 text-xl">
          <OnepointLogo />
          <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-neutral-400">
            Lab IA
          </span>
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h1>
        {/* Accent de signature — un seul, discret */}
        <div className="mx-auto mt-4 h-1 w-12 rounded-full bg-gradient-to-r from-brand-teal to-brand-blue" />
      </header>

      {/* Choix de la langue */}
      <div className="flex gap-2" role="group" aria-label="Choix de la langue">
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
                  ? "bg-brand-blue text-white shadow-sm"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {LABELS[l]}
            </button>
          );
        })}
      </div>

      {/* Texte lu (read-along) */}
      <p className="text-center text-base leading-relaxed text-neutral-600">{text}</p>

      {/* Zone de contrôle — jamais muette sans bouton visible */}
      <div className="flex w-full flex-col items-center gap-4 pb-10">
        {error ? (
          // mp3 manquant : message clair, aucune lecture tentée.
          <p className="text-center text-sm font-medium text-red-600">{error}</p>
        ) : started ? (
          // Lecture déjà lancée → contrôle compact (pas le gros bouton initial).
          <button
            type="button"
            onClick={onPrimary}
            className="flex items-center justify-center rounded-full bg-neutral-100 px-8 py-3 text-base font-semibold text-neutral-700 transition hover:bg-neutral-200 active:scale-95"
          >
            {primaryLabel}
          </button>
        ) : (
          // Avant la première lecture : gros bouton unique (filet anti-page-muette).
          // Si l'autoplay réussit, ce bloc disparaît tout seul (rien à toucher).
          <>
            <button
              type="button"
              onClick={attemptPlay}
              className="flex h-48 w-48 items-center justify-center rounded-full bg-gradient-to-br from-brand-blue to-brand-teal text-2xl font-semibold text-white shadow-lg shadow-brand-blue/20 transition active:scale-95"
            >
              ▶ Écouter
            </button>
            <p className="text-center text-sm text-neutral-400">
              {blocked
                ? "Touchez pour lancer l'audio"
                : "L'audio démarre tout seul…"}
            </p>
          </>
        )}

        {/* key={src} -> remonte l'élément quand la langue change (recharge le bon mp3). */}
        <audio
          key={src}
          ref={audioRef}
          src={src}
          preload="auto"
          onCanPlayThrough={onCanPlayThrough}
          onPlaying={() => {
            setPlaying(true);
            setEnded(false);
            setStarted(true);
            setBlocked(false);
          }}
          onEnded={() => {
            setPlaying(false);
            setEnded(true);
          }}
          onPause={() => setPlaying(false)}
          onError={() => {
            if (autoTimer.current) clearTimeout(autoTimer.current);
            setError("Audio indisponible pour cette langue (mp3 manquant).");
          }}
        />
      </div>
    </main>
  );
}
