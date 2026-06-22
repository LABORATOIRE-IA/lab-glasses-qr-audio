#!/usr/bin/env python3
"""
qr_audio_pipeline.py — Pipeline phase 1 (LOCAL, sans lunettes).

Prouve toute la chaîne :
  décodage QR (OpenCV) -> parsing 'labqr:<id>' -> lookup content.json (langue choisie)
  -> ElevenLabs TTS (multilingue, avec cache) -> lecture audio (afplay sur macOS).

Aucune dépendance lunettes/Meta, aucune dépendance système (pas de zbar) :
  - décodage QR via cv2.QRCodeDetector (wheel opencv-python, pas d'install admin) ;
  - lecture audio via 'afplay' (intégré macOS), appelé en subprocess.

La clé ElevenLabs est lue depuis la variable d'environnement ELEVENLABS_API_KEY
(via pipeline/.env, jamais en clair dans le code).

Exemples :
  python pipeline/qr_audio_pipeline.py --image qr-codes/out/artefact-01.png --lang en
  python pipeline/qr_audio_pipeline.py --webcam --lang es
  python pipeline/qr_audio_pipeline.py --image qr-codes/out/artefact-01.png --no-tts   # décode + texte, sans audio
"""

from __future__ import annotations  # annotations PEP 604 (str | None) compatibles Python 3.9

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import cv2
import requests
from dotenv import load_dotenv

# --- Chemins (relatifs à la racine du repo, peu importe d'où on lance) ---
ROOT = Path(__file__).resolve().parent.parent
CONTENT_JSON = ROOT / "content" / "content.json"
CACHE_DIR = ROOT / "pipeline" / "audio_cache"
ENV_PATH = ROOT / "pipeline" / ".env"

# --- Constantes ---
QR_PREFIX = "labqr:"
DEFAULT_LANG = "fr"
FALLBACK_LANG = "fr"
ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"   # "Rachel", multilingue
DEFAULT_MODEL_ID = "eleven_multilingual_v2"


# ───────────────────────────── 1. DÉCODAGE QR ─────────────────────────────

def decode_qr_from_image(image_path: Path) -> str | None:
    """Décode le QR d'un PNG via OpenCV. Renvoie le payload texte ou None."""
    img = cv2.imread(str(image_path))
    if img is None:
        raise SystemExit(f"Image introuvable ou illisible : {image_path}")
    data, _points, _straight = cv2.QRCodeDetector().detectAndDecode(img)
    return data or None


def decode_qr_from_webcam() -> str | None:
    """Capture live (stand-in 'phone mode') et renvoie le premier QR détecté.

    'q' ou Échap pour annuler. Renvoie le payload ou None si annulé.
    """
    detector = cv2.QRCodeDetector()
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise SystemExit("Webcam inaccessible (autorise l'accès caméra au terminal).")
    print("Webcam active — présente un QR. 'q' pour quitter.")
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                continue
            data, points, _ = detector.detectAndDecode(frame)
            if points is not None:  # dessine le cadre détecté
                pts = points.astype(int).reshape(-1, 2)
                for i in range(len(pts)):
                    cv2.line(frame, tuple(pts[i]), tuple(pts[(i + 1) % len(pts)]), (0, 255, 0), 3)
            cv2.imshow("Lab QR — webcam (q pour quitter)", frame)
            if data:
                return data
            if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                return None
    finally:
        cap.release()
        cv2.destroyAllWindows()


# ───────────────────────────── 2. PARSING ─────────────────────────────────

def parse_payload(payload: str) -> str | None:
    """Vérifie le préfixe 'labqr:' et extrait l'id. Renvoie l'id ou None."""
    if not payload.startswith(QR_PREFIX):
        print(f"⚠️  QR ignoré : ne commence pas par '{QR_PREFIX}' (payload='{payload}').")
        return None
    return payload[len(QR_PREFIX):].strip()


# ───────────────────────────── 3. LOOKUP ──────────────────────────────────

def load_content() -> dict:
    with CONTENT_JSON.open(encoding="utf-8") as f:
        return json.load(f)


def lookup(content: dict, artefact_id: str, lang: str) -> tuple[str, str, str] | None:
    """Renvoie (title, texte, langue_utilisée) ou None si id inconnu.

    Si la langue demandée manque pour cet id -> fallback fr + warning.
    """
    entry = content.get(artefact_id)
    if entry is None:
        known = [k for k in content if not k.startswith("_")]
        print(f"⚠️  Id inconnu : '{artefact_id}'. Ids connus : {', '.join(known)}")
        return None
    langs = entry.get("lang", {})
    used_lang = lang
    if lang not in langs:
        print(f"⚠️  Langue '{lang}' absente pour '{artefact_id}' -> fallback '{FALLBACK_LANG}'.")
        used_lang = FALLBACK_LANG
    text = langs.get(used_lang)
    if text is None:
        print(f"⚠️  Aucun texte (même en {FALLBACK_LANG}) pour '{artefact_id}'.")
        return None
    return entry.get("title", artefact_id), text, used_lang


# ───────────────────────────── 4-5. TTS + CACHE ───────────────────────────

def synthesize_tts(text: str, artefact_id: str, lang: str, *, use_cache: bool) -> Path:
    """Synthétise (ou réutilise le cache) l'audio ElevenLabs. Renvoie le chemin mp3."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    out_path = CACHE_DIR / f"{artefact_id}_{lang}.mp3"

    if use_cache and out_path.exists():
        print(f"🗄️  Cache réutilisé : {out_path.relative_to(ROOT)}")
        return out_path

    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        raise SystemExit(
            "ELEVENLABS_API_KEY manquante. Copie pipeline/.env.example -> pipeline/.env "
            "et renseigne ta clé (ou lance avec --no-tts pour t'arrêter au texte)."
        )
    voice_id = os.environ.get("ELEVENLABS_VOICE_ID", DEFAULT_VOICE_ID)
    model_id = os.environ.get("ELEVENLABS_MODEL_ID", DEFAULT_MODEL_ID)

    print(f"🔊 TTS ElevenLabs (voice={voice_id}, model={model_id})…")
    resp = requests.post(
        ELEVENLABS_TTS_URL.format(voice_id=voice_id),
        headers={"xi-api-key": api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        json={"text": text, "model_id": model_id},
        timeout=60,
    )
    if resp.status_code != 200:
        raise SystemExit(f"Erreur ElevenLabs {resp.status_code} : {resp.text[:300]}")
    out_path.write_bytes(resp.content)
    print(f"💾 Audio écrit : {out_path.relative_to(ROOT)} ({len(resp.content)} octets)")
    return out_path


# ───────────────────────────── 6. LECTURE ─────────────────────────────────

def play_audio(mp3_path: Path) -> None:
    """Joue le mp3 via afplay (macOS). Fallbacks : 'open', puis simple message."""
    if shutil.which("afplay"):
        subprocess.run(["afplay", str(mp3_path)], check=False)
    elif shutil.which("open"):  # macOS : ouvre le lecteur par défaut
        subprocess.run(["open", str(mp3_path)], check=False)
    else:
        print(f"ℹ️  Lecteur audio introuvable. Fichier prêt : {mp3_path}")


# ───────────────────────────── ORCHESTRATION ──────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Pipeline QR -> audio multilingue (phase 1, local).")
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--image", type=Path, help="décode un PNG (ex. qr-codes/out/artefact-01.png)")
    src.add_argument("--webcam", action="store_true", help="capture live via la webcam du laptop")
    parser.add_argument("--lang", default=DEFAULT_LANG, help="fr|en|es|de (défaut fr)")
    parser.add_argument("--no-cache", action="store_true", help="force la régénération TTS")
    parser.add_argument("--no-tts", action="store_true", help="s'arrête après le texte (pas d'audio)")
    args = parser.parse_args()

    load_dotenv(ENV_PATH)

    # 1. Décodage
    payload = decode_qr_from_webcam() if args.webcam else decode_qr_from_image(args.image)
    if not payload:
        print("Aucun QR décodé.")
        sys.exit(1)
    print(f"📷 Payload décodé : '{payload}'")

    # 2. Parsing
    artefact_id = parse_payload(payload)
    if artefact_id is None:
        sys.exit(1)

    # 3. Lookup
    result = lookup(load_content(), artefact_id, args.lang)
    if result is None:
        sys.exit(1)
    title, text, used_lang = result
    print(f"🆔 {artefact_id} | titre : {title} | langue : {used_lang}")
    print(f"📝 {text}")

    if args.no_tts:
        print("⏭️  --no-tts : on s'arrête au texte (pas de synthèse ni lecture).")
        return

    # 4-5. TTS + cache, 6. lecture
    mp3 = synthesize_tts(text, artefact_id, used_lang, use_cache=not args.no_cache)
    play_audio(mp3)
    print("✅ Terminé.")


if __name__ == "__main__":
    main()
