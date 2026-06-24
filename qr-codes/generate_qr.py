#!/usr/bin/env python3
"""
generate_qr.py — Génération des QR codes du POC "Lunettes Ray-Ban Meta : QR -> audio".

PIVOT WEB : chaque QR encode désormais une URL <BASE_URL>/play/<id>
  (ex. https://lab-glasses-qr-audio.vercel.app/play/artefact-01).
  Scanné par les lunettes / le téléphone, il ouvre directement la page visiteur.
  (Avant le pivot : schéma 'labqr:<id>', décodé par une app native — abandonné.)

Principe :
  - La liste des IDs vient de content/content.json (SOURCE DE VÉRITÉ) : jamais hardcodée.
  - BASE_URL est fourni en argument (--base-url) ou via la variable d'env BASE_URL.
    On le connaît une fois le déploiement Vercel fait.

Sorties (dans qr-codes/out/, gitignored) :
  - un PNG par ID : <id>.png  (QR + ID écrit en clair dessous)
  - une planche contact : _contact-sheet.png (grille des QR labellisés, prête à imprimer)

Contraintes QR (la caméra des lunettes peine sur les petits objets -> grands et nets) :
  - correction d'erreur niveau H (~30%), taille >= 820px, quiet zone généreuse,
    noir sur blanc plein contraste.

Dépendances : qrcode, Pillow (voir requirements.txt).

Usage :
  # un seul QR (le QR de test du POC) :
  python qr-codes/generate_qr.py --base-url https://mon-app.vercel.app --id artefact-01
  # les 10 QR + planche contact :
  python qr-codes/generate_qr.py --base-url https://mon-app.vercel.app
  # BASE_URL peut aussi venir de l'environnement :
  BASE_URL=https://mon-app.vercel.app python qr-codes/generate_qr.py
"""

import argparse
import json
import math
import os
from pathlib import Path

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont

# --- Chemins (relatifs à la racine du repo, peu importe d'où on lance) ---
ROOT = Path(__file__).resolve().parent.parent
CONTENT_JSON = ROOT / "content" / "content.json"
OUT_DIR = ROOT / "qr-codes" / "out"

# --- Paramètres ---
MIN_SIZE = 820           # taille mini du QR (px), hors label
QUIET_ZONE = 6           # "border" qrcode, en modules (quiet zone généreuse)
LABEL_BAND = 70          # hauteur de la bande de texte sous le QR (px)


def load_ids(content_path: Path) -> list[str]:
    """Lit les IDs depuis content.json (toutes les clés sauf les méta '_...')."""
    with content_path.open(encoding="utf-8") as f:
        data = json.load(f)
    ids = [k for k in data.keys() if not k.startswith("_")]
    if not ids:
        raise SystemExit(f"Aucun ID trouvé dans {content_path}")
    return ids


def build_url(base_url: str, artefact_id: str) -> str:
    """URL encodée dans le QR : <BASE_URL>/play/<id> (sans double slash)."""
    return f"{base_url.rstrip('/')}/play/{artefact_id}"


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    """Police lisible ; repli sur la police par défaut si introuvable (Mac corporate)."""
    for name in ("Arial.ttf", "Helvetica.ttc", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make_qr_image(payload: str) -> Image.Image:
    """Génère l'image QR pure (noir sur blanc, niveau H), redimensionnée >= MIN_SIZE."""
    qr = qrcode.QRCode(
        error_correction=ERROR_CORRECT_H,  # ~30% de redondance -> robuste
        box_size=10,
        border=QUIET_ZONE,                 # quiet zone généreuse
    )
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")

    # On force une taille >= MIN_SIZE, en gardant des modules nets (resampling NEAREST).
    if img.width < MIN_SIZE:
        factor = math.ceil(MIN_SIZE / img.width)
        img = img.resize((img.width * factor, img.height * factor), Image.NEAREST)
    return img


def add_label(qr_img: Image.Image, text: str) -> Image.Image:
    """Ajoute une bande blanche sous le QR avec l'ID écrit en clair (lisibilité démo)."""
    w = qr_img.width
    canvas = Image.new("RGB", (w, qr_img.height + LABEL_BAND), "white")
    canvas.paste(qr_img, (0, 0))

    draw = ImageDraw.Draw(canvas)
    font = _load_font(36)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (w - tw) // 2
    y = qr_img.height + (LABEL_BAND - th) // 2 - bbox[1]
    draw.text((x, y), text, fill="black", font=font)
    return canvas


def build_contact_sheet(labeled: dict[str, Image.Image]) -> Image.Image:
    """Assemble tous les QR labellisés en une grille unique, prête à imprimer."""
    ids = list(labeled.keys())
    cols = min(3, len(ids))
    rows = math.ceil(len(ids) / cols)

    # Toutes les vignettes ont la même taille -> on prend la plus grande comme cellule.
    cell_w = max(im.width for im in labeled.values())
    cell_h = max(im.height for im in labeled.values())
    margin = 30

    sheet_w = cols * cell_w + (cols + 1) * margin
    sheet_h = rows * cell_h + (rows + 1) * margin
    sheet = Image.new("RGB", (sheet_w, sheet_h), "white")

    for i, _id in enumerate(ids):
        r, c = divmod(i, cols)
        x = margin + c * (cell_w + margin)
        y = margin + r * (cell_h + margin)
        im = labeled[_id]
        sheet.paste(im, (x + (cell_w - im.width) // 2, y))  # centrage horizontal
    return sheet


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Génère les QR codes <BASE_URL>/play/<id>.")
    p.add_argument(
        "--base-url",
        default=os.environ.get("BASE_URL"),
        help="URL de base de l'app déployée (ou variable d'env BASE_URL). "
             "Ex. https://mon-app.vercel.app",
    )
    p.add_argument(
        "--id",
        action="append",
        dest="ids",
        help="Limiter à un (ou plusieurs) id. Répétable. Défaut : tous les ids.",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    if not args.base_url:
        raise SystemExit(
            "BASE_URL manquant. Donne --base-url https://mon-app.vercel.app "
            "(ou exporte BASE_URL). On le connaît une fois Vercel déployé."
        )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all_ids = load_ids(CONTENT_JSON)
    if args.ids:
        unknown = [i for i in args.ids if i not in all_ids]
        if unknown:
            raise SystemExit(f"Id(s) inconnu(s) : {unknown}. Connus : {all_ids}")
        ids = args.ids
    else:
        ids = all_ids

    print(f"{len(ids)} QR à générer — base: {args.base_url.rstrip('/')}")

    labeled: dict[str, Image.Image] = {}
    for _id in ids:
        url = build_url(args.base_url, _id)
        img = add_label(make_qr_image(url), _id)
        out_path = OUT_DIR / f"{_id}.png"
        img.save(out_path)
        labeled[_id] = img
        print(f"  ✓ {out_path.relative_to(ROOT)}  (encode '{url}', {img.width}x{img.height}px)")

    # Planche contact seulement si plus d'un QR (inutile pour un QR de test seul).
    if len(labeled) > 1:
        sheet = build_contact_sheet(labeled)
        sheet_path = OUT_DIR / "_contact-sheet.png"
        sheet.save(sheet_path)
        print(f"Planche contact : {sheet_path.relative_to(ROOT)}  ({sheet.width}x{sheet.height}px)")


if __name__ == "__main__":
    main()
