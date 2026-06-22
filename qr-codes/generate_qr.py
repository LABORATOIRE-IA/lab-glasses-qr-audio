#!/usr/bin/env python3
"""
generate_qr.py — Génération des QR codes du POC "Lunettes Ray-Ban Meta : QR -> audio".

Principe (voir CLAUDE.md) :
  - Chaque QR encode un IDENTIFIANT court, pas le texte. Un seul QR sert toutes les langues.
  - La liste des IDs vient de content/content.json (SOURCE DE VÉRITÉ) : on ne la hardcode pas.
  - Contenu encodé = schéma préfixé "labqr:<id>" (ex. "labqr:artefact-01").
    Le préfixe "labqr:" permet à l'app de distinguer NOS QR d'un QR quelconque au décodage
    (on ignore tout QR qui ne commence pas par "labqr:").

Sorties (dans qr-codes/out/, gitignored) :
  - un PNG par ID : <id>.png  (QR + ID écrit en clair dessous)
  - une planche contact : _contact-sheet.png (grille des 10 QR labellisés, prête à imprimer)

Contraintes QR (la caméra des lunettes peine sur les petits objets -> grands et nets) :
  - correction d'erreur niveau H (~30%), taille >= 600px, quiet zone généreuse,
    noir sur blanc plein contraste.

Dépendances : qrcode, Pillow (voir requirements.txt). Aucune dépendance lunettes/Meta/ElevenLabs.

Usage :
  python qr-codes/generate_qr.py
"""

import json
import math
from pathlib import Path

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont

# --- Chemins (relatifs à la racine du repo, peu importe d'où on lance) ---
ROOT = Path(__file__).resolve().parent.parent
CONTENT_JSON = ROOT / "content" / "content.json"
OUT_DIR = ROOT / "qr-codes" / "out"

# --- Paramètres ---
QR_PREFIX = "labqr:"     # schéma encodé : labqr:<id>
MIN_SIZE = 600           # taille mini du QR (px), hors label
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
    cols = 3
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
        # centrage horizontal dans la cellule
        sheet.paste(im, (x + (cell_w - im.width) // 2, y))
    return sheet


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ids = load_ids(CONTENT_JSON)
    print(f"{len(ids)} IDs lus depuis {CONTENT_JSON.relative_to(ROOT)}")

    labeled: dict[str, Image.Image] = {}
    for _id in ids:
        payload = f"{QR_PREFIX}{_id}"
        img = add_label(make_qr_image(payload), _id)
        out_path = OUT_DIR / f"{_id}.png"
        img.save(out_path)
        labeled[_id] = img
        print(f"  ✓ {out_path.relative_to(ROOT)}  (encode '{payload}', {img.width}x{img.height}px)")

    sheet = build_contact_sheet(labeled)
    sheet_path = OUT_DIR / "_contact-sheet.png"
    sheet.save(sheet_path)
    print(f"Planche contact : {sheet_path.relative_to(ROOT)}  ({sheet.width}x{sheet.height}px)")


if __name__ == "__main__":
    main()
