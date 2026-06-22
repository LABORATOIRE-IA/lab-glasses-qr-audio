# Lunettes Ray-Ban Meta : QR → audio multilingue

POC pour l'**Agentic Livepoint** (showroom du Lab IA de Onepoint).
Un visiteur **scanne un QR code** posé sur un artefact → les **lunettes Ray-Ban Meta**
jouent un **audio explicatif** dans la **langue choisie**, via les haut-parleurs *open-ear*.

## Comment ça marche
Le QR encode un **identifiant court**. L'app décode l'ID, retrouve le texte associé
(`content/content.json`, par langue), le synthétise en audio avec **ElevenLabs (TTS)**,
puis le joue dans les lunettes.

```
QR (ID) → décodage → lookup texte (par langue) → ElevenLabs TTS → audio
```

## Phases
1. **Prototype local** (Python, sans lunettes) — toute la chaîne QR → audio. *(priorité)*
2. **App mobile** iOS Swift + Meta DAT SDK (mock device).
3. **Lunettes réelles** Ray-Ban Meta Gen 2.

## Structure
| Dossier | Rôle |
|---------|------|
| `content/` | textes par langue (`content.json`) |
| `qr-codes/` | génération des QR + sorties |
| `pipeline/` | prototype phone-mode (phase 1) |
| `app/` | app mobile Swift (phase 2) |
| `reference/` | repos de référence (lecture seule, non versionnés) |
| `docs/` | specs & notes |

## Génération des QR
Les QR sont générés à partir de `content/content.json` (source de vérité des IDs).
Chaque QR encode **`labqr:<id>`** (ex. `labqr:artefact-01`) — le préfixe `labqr:`
permet à l'app de reconnaître nos QR et d'ignorer tout autre QR.

```bash
python3 -m venv .venv
.venv/bin/pip install -r qr-codes/requirements.txt
.venv/bin/python qr-codes/generate_qr.py
```

Sorties dans `qr-codes/out/` (gitignored) :
- un PNG par artefact (`artefact-01.png` … `artefact-10.png`), QR niveau H, ≥ 600 px,
  ID écrit en clair sous le code ;
- `_contact-sheet.png` : planche contact (grille des 10 QR labellisés), prête à imprimer.

## Pipeline (phase 1)
Chaîne locale, sans lunettes : **décodage QR (OpenCV) → lookup `content.json` →
ElevenLabs TTS → lecture audio (`afplay`)**. Décodage via `cv2.QRCodeDetector`
(wheel `opencv-python`, aucun install admin, pas de `zbar`).

### Installation
```bash
python3 -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt
```

### Clé ElevenLabs (jamais commitée)
```bash
cp pipeline/.env.example pipeline/.env   # puis renseigner ELEVENLABS_API_KEY
```
`pipeline/.env` est gitignored. Voix/modèle configurables (`ELEVENLABS_VOICE_ID`,
`ELEVENLABS_MODEL_ID`, défaut `eleven_multilingual_v2`).

### Commandes
```bash
# Décoder un PNG + jouer l'audio dans une langue
.venv/bin/python pipeline/qr_audio_pipeline.py --image qr-codes/out/artefact-01.png --lang en

# Mode "phone" : webcam du laptop (premier QR détecté)
.venv/bin/python pipeline/qr_audio_pipeline.py --webcam --lang es

# Décoder + afficher le texte SANS audio (test rapide)
.venv/bin/python pipeline/qr_audio_pipeline.py --image qr-codes/out/artefact-01.png --no-tts

# Forcer la régénération TTS (ignore le cache)
.venv/bin/python pipeline/qr_audio_pipeline.py --image qr-codes/out/artefact-01.png --lang de --no-cache
```
Options : `--lang fr|en|es|de` (défaut `fr`, fallback `fr` si langue absente),
`--no-cache`, `--no-tts`. L'audio est mis en cache dans `pipeline/audio_cache/<id>_<lang>.mp3`
(gitignored) et réutilisé aux scans suivants.

### Test round-trip (génération ↔ décodage)
```bash
.venv/bin/python pipeline/test_decode.py   # décode les 10 PNG, attend 'labqr:artefact-NN'
```

## Détails
Voir [`CLAUDE.md`](./CLAUDE.md) pour l'architecture, les faits techniques et les conventions.
