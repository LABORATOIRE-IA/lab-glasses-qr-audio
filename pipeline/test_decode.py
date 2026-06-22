#!/usr/bin/env python3
"""
test_decode.py — Test round-trip génération <-> décodage (OpenCV, pas de zbar).

Décode les 10 PNG de qr-codes/out/ avec cv2.QRCodeDetector et vérifie que chacun
redonne bien 'labqr:artefact-NN'. Prouve que la chaîne génération -> décodage tient.

Usage :
  python pipeline/test_decode.py
Sortie : code 0 si tout passe, 1 sinon.
"""

import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "qr-codes" / "out"
PREFIX = "labqr:"


def main() -> int:
    detector = cv2.QRCodeDetector()
    pngs = sorted(p for p in OUT_DIR.glob("artefact-*.png"))
    if not pngs:
        print(f"Aucun PNG dans {OUT_DIR}. Lance d'abord qr-codes/generate_qr.py.")
        return 1

    ok = 0
    for png in pngs:
        expected = f"{PREFIX}{png.stem}"  # ex. labqr:artefact-01
        img = cv2.imread(str(png))
        data, _pts, _ = detector.detectAndDecode(img)
        passed = data == expected
        ok += passed
        mark = "✓" if passed else "✗"
        print(f"  {mark} {png.name}: décodé='{data}' attendu='{expected}'")

    total = len(pngs)
    print(f"\n{ok}/{total} QR décodés correctement.")
    return 0 if ok == total else 1


if __name__ == "__main__":
    sys.exit(main())
