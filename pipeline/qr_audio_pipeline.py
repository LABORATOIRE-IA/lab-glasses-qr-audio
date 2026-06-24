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
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

import cv2
import requests
from dotenv import load_dotenv

# --- Chemins (relatifs à la racine du repo, peu importe d'où on lance) ---
ROOT = Path(__file__).resolve().parent.parent
CONTENT_JSON = ROOT / "content" / "content.json"
CACHE_DIR = ROOT / "pipeline" / "audio_cache"
ENV_PATH = ROOT / "pipeline" / ".env"
PRONUNCIATIONS_JSON = ROOT / "pipeline" / "pronunciations.json"

# --- Constantes ---
QR_PREFIX = "labqr:"
DEFAULT_LANG = "fr"
FALLBACK_LANG = "fr"
ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"   # "Rachel", multilingue
DEFAULT_MODEL_ID = "eleven_multilingual_v2"

# Webcam (mode --webcam)
LANG_KEYS = {ord("f"): "fr", ord("e"): "en", ord("s"): "es", ord("d"): "de"}
WEBCAM_COOLDOWN_S = 3.0   # même QR resté dans le champ : pas de re-déclenchement avant ce délai
ABSENCE_FRAMES_RESET = 5  # nb de frames sans QR avant de "réarmer" (QR sorti puis re-rentré)


# ───────────────────────────── 1. DÉCODAGE QR ─────────────────────────────

def decode_qr_from_image(image_path: Path) -> str | None:
    """Décode le QR d'un PNG via OpenCV. Renvoie le payload texte ou None."""
    img = cv2.imread(str(image_path))
    if img is None:
        raise SystemExit(f"Image introuvable ou illisible : {image_path}")
    data, _points, _straight = cv2.QRCodeDetector().detectAndDecode(img)
    return data or None


def _draw_overlay(frame, lines: list[str]) -> None:
    """Affiche quelques lignes de texte en surimpression (HUD de démo)."""
    for i, line in enumerate(lines):
        y = 30 + i * 30
        cv2.putText(frame, line, (12, y), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.putText(frame, line, (12, y), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 1, cv2.LINE_AA)


def run_webcam(content: dict, lang: str, *, use_cache: bool, no_tts: bool) -> None:
    """Capture live (stand-in 'phone mode') : détecte les QR en continu et déclenche
    la chaîne aval (lookup -> normalisation -> TTS/cache -> afplay) à chaque scan.

    Debounce : un même QR resté dans le champ n'est pas rejoué avant WEBCAM_COOLDOWN_S,
    et un QR sorti puis re-rentré (>= ABSENCE_FRAMES_RESET frames sans détection) réarme.
    Touches : q/Échap = quitter ; f/e/s/d = changer la langue à la volée.
    """
    detector = cv2.QRCodeDetector()
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        cap.release()
        raise SystemExit(
            "Webcam inaccessible. Autorise l'accès caméra : "
            "Réglages → Confidentialité et sécurité → Caméra, puis relance."
        )
    print("📷 Webcam active — présente un QR. Touches : q=quitter, f/e/s/d=langue.")

    last_payload = None       # dernier payload déclenché (pour le debounce)
    last_trigger = -1e9       # time.monotonic du dernier déclenchement
    empty_frames = 0          # frames consécutives sans QR (détecte la sortie du champ)
    status = "En attente d'un QR…"
    lost_frames = 0           # robustesse : caméra qui décroche
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                lost_frames += 1
                if lost_frames > 100:
                    print("⚠️  Flux caméra perdu — arrêt.")
                    break
                continue
            lost_frames = 0

            data, points, _ = detector.detectAndDecode(frame)

            if data:
                left_and_back = empty_frames >= ABSENCE_FRAMES_RESET
                empty_frames = 0
                if points is not None:  # cadre vert autour du QR
                    pts = points.astype(int).reshape(-1, 2)
                    for i in range(len(pts)):
                        cv2.line(frame, tuple(pts[i]), tuple(pts[(i + 1) % len(pts)]), (0, 255, 0), 3)

                now = time.monotonic()
                is_new = data != last_payload
                cooldown_ok = (now - last_trigger) >= WEBCAM_COOLDOWN_S
                if is_new or left_and_back or cooldown_ok:
                    last_payload, last_trigger = data, now
                    print(f"\n📷 Scan : '{data}' (langue {lang})")
                    res = handle_payload(content, data, lang,
                                         use_cache=use_cache, no_tts=no_tts, play_block=False)
                    status = (f"▶ {res[0]} en {res[1]}" if res else "QR non reconnu")
            else:
                empty_frames += 1

            _draw_overlay(frame, [f"Langue: {lang}  (f/e/s/d)", status, "q = quitter"])
            cv2.imshow("Lab QR — webcam", frame)

            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            if key in LANG_KEYS:
                lang = LANG_KEYS[key]
                last_payload = None  # réarme : le QR présent rejoue dans la nouvelle langue
                print(f"🌐 Langue -> {lang}")
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


# ─────────────────────── 3bis. NORMALISATION PRONONCIATION ────────────────

def normalize_pronunciation(text: str) -> str:
    """Applique la table pipeline/pronunciations.json au texte AVANT le TTS.

    eleven_multilingual_v2 ne supporte pas le SSML <phoneme> : on corrige donc
    certains sigles/marques côté texte (ex. 'IA' -> 'I.A.' pour une lecture 'i-a').
    Remplacement par MOT ENTIER (\\bCLE\\b) et SENSIBLE À LA CASSE : on ne touche
    pas aux mots qui contiennent la clé (média, diagnostic, spécial…).
    """
    if not PRONUNCIATIONS_JSON.exists():
        return text
    with PRONUNCIATIONS_JSON.open(encoding="utf-8") as f:
        table = json.load(f)
    for key, value in table.items():
        if key.startswith("_"):  # clés méta (_comment…)
            continue
        text = re.sub(rf"\b{re.escape(key)}\b", value, text)  # casse respectée (pas de re.IGNORECASE)
    return text


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

def play_audio(mp3_path: Path, *, block: bool = True) -> None:
    """Joue le mp3 via afplay (macOS). Fallbacks : 'open', puis simple message.

    block=True (défaut, mode --image) : attend la fin de la lecture.
    block=False (mode --webcam) : lance la lecture sans figer la boucle de capture.
    """
    if shutil.which("afplay"):
        runner = subprocess.run if block else subprocess.Popen
        runner(["afplay", str(mp3_path)], **({"check": False} if block else {}))
    elif shutil.which("open"):  # macOS : ouvre le lecteur par défaut (non bloquant)
        subprocess.Popen(["open", str(mp3_path)])
    else:
        print(f"ℹ️  Lecteur audio introuvable. Fichier prêt : {mp3_path}")


# ───────────────────────────── ORCHESTRATION ──────────────────────────────

def handle_payload(content: dict, payload: str, lang: str, *,
                   use_cache: bool, no_tts: bool, play_block: bool = True) -> tuple[str, str] | None:
    """Chaîne aval commune à --image et --webcam :
    parsing 'labqr:<id>' -> lookup (langue) -> normalisation -> TTS/cache -> lecture.
    Renvoie (artefact_id, langue_jouée) si traité, None si rejeté (préfixe/id invalide).
    """
    artefact_id = parse_payload(payload)
    if artefact_id is None:
        return None

    result = lookup(content, artefact_id, lang)
    if result is None:
        return None
    title, text, used_lang = result
    print(f"🆔 {artefact_id} | titre : {title} | langue : {used_lang}")
    print(f"📝 {text}")

    if no_tts:
        print("⏭️  --no-tts : on s'arrête au texte (pas de synthèse ni lecture).")
        return artefact_id, used_lang

    # Normalisation prononciation (avant TTS)
    spoken = normalize_pronunciation(text)
    if spoken != text:
        print(f"🗣️  Texte normalisé pour le TTS : {spoken}")

    mp3 = synthesize_tts(spoken, artefact_id, used_lang, use_cache=use_cache)
    play_audio(mp3, block=play_block)
    print("✅ Terminé.")
    return artefact_id, used_lang


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
    content = load_content()

    if args.webcam:
        run_webcam(content, args.lang, use_cache=not args.no_cache, no_tts=args.no_tts)
        return

    # Mode --image : décodage unique puis chaîne aval
    payload = decode_qr_from_image(args.image)
    if not payload:
        print("Aucun QR décodé.")
        sys.exit(1)
    print(f"📷 Payload décodé : '{payload}'")
    if handle_payload(content, payload, args.lang,
                      use_cache=not args.no_cache, no_tts=args.no_tts) is None:
        sys.exit(1)


if __name__ == "__main__":
    main()
