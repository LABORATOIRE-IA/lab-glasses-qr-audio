"use client";

// Gallery — accueil "/" : visite guidée façon cartel de musée, charte Onepoint.
// Lecture seule : ne touche pas au contenu, n'écrit rien.
// - QR live encodant <BASE_URL>/play/<id> (niveau H), cliquable → lightbox agrandi.
// - Badges des langues dont l'audio existe.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import QrCode, { qrTargetUrl } from "@/components/QrCode";
import OnepointLogo from "@/components/OnepointLogo";
import { useBaseUrl } from "@/lib/useBaseUrl";
import { LANGS, type Lang } from "@/lib/schema";

const LANG_LABEL: Record<Lang, string> = { fr: "FR", en: "EN", es: "ES", de: "DE" };

export type GalleryItem = {
  id: string;
  n: number;
  title: string;
  audioLangs: Lang[];
};

export default function Gallery({ items }: { items: GalleryItem[] }) {
  const { baseUrl, baseConfigured, origin } = useBaseUrl();
  // Expérience dont le QR est agrandi (lightbox) + élément déclencheur (restaure le focus).
  const [active, setActive] = useState<GalleryItem | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  function openLightbox(item: GalleryItem, trigger: HTMLElement) {
    triggerRef.current = trigger;
    setActive(item);
  }
  function closeLightbox() {
    setActive(null);
    triggerRef.current?.focus(); // retour du focus au QR déclencheur
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      {/* En-tête charte : logo + accent de signature unique (arc teal→bleu) */}
      <header className="mb-12 text-center">
        <div className="flex items-center justify-center gap-2 text-2xl">
          <OnepointLogo />
          <span className="text-xs font-medium uppercase tracking-[0.25em] text-neutral-400">
            Lab IA
          </span>
        </div>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight">Visite guidée</h1>
        {/* Accent de signature — un seul, discret */}
        <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-gradient-to-r from-brand-teal to-brand-blue" />
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-neutral-500">
          Scannez le QR d&apos;une expérience avec les lunettes Ray-Ban Meta pour
          écouter l&apos;explication dans votre langue. Touchez un QR pour
          l&apos;agrandir avant de scanner.
        </p>
      </header>

      {!baseConfigured && (
        <p className="mx-auto mb-10 max-w-2xl rounded-lg bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-800">
          ⚠️ Les QR pointent vers{" "}
          <code className="rounded bg-amber-100 px-1">{origin || "localhost"}</code>{" "}
          (non scannables hors de cette machine). Définissez{" "}
          <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_BASE_URL</code>{" "}
          pour la prod.
        </p>
      )}

      <ul className="grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
          >
            {/* En-tête cartel : numéro de parcours + titre */}
            <div className="mb-6 flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-base font-semibold text-white tabular-nums">
                {item.n}
              </span>
              <div className="min-w-0 pt-0.5">
                <h2 className="truncate text-lg font-semibold leading-tight">
                  {item.title || <span className="text-neutral-400">Sans titre</span>}
                </h2>
                <p className="mt-0.5 font-mono text-xs text-neutral-400">{item.id}</p>
              </div>
            </div>

            {/* QR live (cliquable → lightbox) + download */}
            <div className="flex justify-center">
              <QrCode
                id={item.id}
                baseUrl={baseUrl}
                size={172}
                onZoom={(trigger) => openLightbox(item, trigger)}
              />
            </div>

            {/* Badges des langues dont l'audio existe */}
            <div className="mt-6 border-t border-neutral-100 pt-4">
              <p className="mb-2.5 text-center text-[11px] uppercase tracking-wider text-neutral-400">
                Audio disponible
              </p>
              <div className="flex justify-center gap-1.5">
                {LANGS.map((l) => {
                  const has = item.audioLangs.includes(l);
                  return (
                    <span
                      key={l}
                      title={`${LANG_LABEL[l]} : audio ${has ? "disponible" : "manquant"}`}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                        has
                          ? "bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/20"
                          : "bg-neutral-100 text-neutral-300"
                      }`}
                    >
                      {LANG_LABEL[l]}
                    </span>
                  );
                })}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Lien admin discret (403 attendu en prod) */}
      <footer className="mt-14 text-center">
        <Link
          href="/admin"
          className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-600"
        >
          Admin
        </Link>
      </footer>

      {active && (
        <QrLightbox item={active} baseUrl={baseUrl} onClose={closeLightbox} />
      )}
    </main>
  );
}

// ───────────────────────────── Lightbox QR ─────────────────────────────

// QR agrandi & net (≈60vmin, plafonné 480px), niveau H, quiet zone blanche autour.
// Le fond passe en flou + assombri (backdrop-filter) → seuls les QR de la page sont
// illisibles pour les lunettes, sauf celui-ci. Fermeture : fond / bouton / Échap.
function QrLightbox({
  item,
  baseUrl,
  onClose,
}: {
  item: GalleryItem;
  baseUrl: string;
  onClose: () => void;
}) {
  const [show, setShow] = useState(false); // pilote la transition d'entrée
  const [qr, setQr] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  // Montage : transition, focus sur la modale, Échap, scroll bloqué.
  useEffect(() => {
    setShow(true);
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // QR haute résolution (960px, niveau H, marge 4 = quiet zone) pour un rendu net.
  useEffect(() => {
    const url = qrTargetUrl(baseUrl, item.id);
    if (!url) return;
    let alive = true;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: "H",
      margin: 4,
      width: 960,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(""));
    return () => {
      alive = false;
    };
  }, [baseUrl, item.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Fond flouté + assombri (clic = fermer) */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-black/55 backdrop-blur-md transition-opacity duration-300 ${
          show ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Panneau */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`QR — ${item.title || item.id}`}
        className={`relative z-10 w-full max-w-lg rounded-3xl bg-white p-7 shadow-2xl transition-all duration-300 ${
          show ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
        >
          <span className="text-lg leading-none">✕</span>
        </button>

        <p className="text-center text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-400">
          Expérience {item.n}
        </p>
        <h2 className="mt-1 text-center text-xl font-semibold">
          {item.title || item.id}
        </h2>

        {/* QR net + quiet zone blanche */}
        <div className="mx-auto mt-5 w-[60vmin] max-w-[480px] rounded-2xl bg-white p-4 ring-1 ring-neutral-200">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR ${item.id}`} className="w-full" />
          ) : (
            <div className="aspect-square w-full animate-pulse rounded bg-neutral-100" />
          )}
        </div>

        {/* CTA sobre */}
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-neutral-600">
          <GlassesIcon className="h-5 w-5 shrink-0 text-brand-blue" />
          Approchez vos lunettes Ray-Ban et scannez
        </p>
      </div>
    </div>
  );
}

function GlassesIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <circle cx="6" cy="14" r="3.2" />
      <circle cx="18" cy="14" r="3.2" />
      <path d="M9.2 14c.9-1.1 4.7-1.1 5.6 0" />
      <path d="M2.8 14C2.8 9 4 7 6.5 7" />
      <path d="M21.2 14C21.2 9 20 7 17.5 7" />
    </svg>
  );
}
