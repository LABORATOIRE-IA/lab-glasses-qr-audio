"use client";

// QrCode — aperçu QR live + export PNG, partagé par la galerie (/) et l'admin.
//
// Encode <baseUrl>/play/<id> : une PAGE visiteur, JAMAIS un mp3. Niveau de correction
// H (cohérent avec qr-codes/generate_qr.py). Aperçu à la taille demandée, export PNG
// haute résolution (~820px, noir/blanc plein contraste) pour l'impression.

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** URL cible encodée dans le QR (vide si baseUrl inconnue). */
export function qrTargetUrl(baseUrl: string, id: string): string {
  return baseUrl ? `${baseUrl.replace(/\/+$/, "")}/play/${id}` : "";
}

export default function QrCode({
  id,
  baseUrl,
  size = 96,
  downloadLabel = "Télécharger PNG",
  onZoom,
}: {
  id: string;
  baseUrl: string;
  size?: number;
  downloadLabel?: string;
  // Si fourni, le QR devient cliquable (ouvre une vue agrandie) ; reçoit l'élément
  // déclencheur pour restaurer le focus à la fermeture. L'admin ne le fournit pas.
  onZoom?: (trigger: HTMLElement) => void;
}) {
  const url = qrTargetUrl(baseUrl, id);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!url) {
      setPreview("");
      return;
    }
    let alive = true;
    // width *2 → aperçu net sur écrans HiDPI.
    QRCode.toDataURL(url, { errorCorrectionLevel: "H", margin: 2, width: size * 2 })
      .then((d) => alive && setPreview(d))
      .catch(() => alive && setPreview(""));
    return () => {
      alive = false;
    };
  }, [url, size]);

  async function download() {
    if (!url) return;
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "H",
      margin: 4,
      width: 820,
      color: { dark: "#000000", light: "#ffffff" },
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${id}.png`; // nommage déterministe
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // eslint-disable-next-line @next/next/no-img-element
  const img = (
    <img
      src={preview}
      alt={`QR ${id}`}
      width={size}
      height={size}
      title={url}
      className="rounded border border-neutral-200 bg-white"
    />
  );

  const placeholder = (
    <span
      className="flex items-center justify-center text-xs text-neutral-300"
      style={{ width: size, height: size }}
    >
      …
    </span>
  );

  return (
    <div className="flex flex-col items-center gap-2">
      {!preview ? (
        placeholder
      ) : onZoom ? (
        // QR cliquable : indice de survol « Toucher pour agrandir » + curseur pointer.
        // QR cliquable : indice de survol (desktop) + indice persistant (tactile).
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => onZoom(e.currentTarget)}
            aria-label={`Agrandir le QR ${id}`}
            className="group relative cursor-pointer rounded ring-brand-blue/40 transition focus:outline-none focus-visible:ring-2"
          >
            {img}
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded text-[11px] font-medium text-transparent opacity-0 transition group-hover:bg-black/55 group-hover:text-white group-hover:opacity-100">
              Toucher pour agrandir
            </span>
          </button>
          {/* Affordance visible au tactile (pas de survol sur un kiosque mobile) */}
          <span className="pointer-events-none text-[11px] font-medium text-brand-blue">
            ⤢ Toucher pour agrandir
          </span>
        </div>
      ) : (
        img
      )}
      <button
        type="button"
        onClick={download}
        disabled={!url}
        className="text-xs font-medium text-neutral-700 underline disabled:opacity-40"
      >
        {downloadLabel}
      </button>
    </div>
  );
}
