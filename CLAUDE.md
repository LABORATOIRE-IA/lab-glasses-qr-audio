# CLAUDE.md — Lunettes Ray-Ban Meta : QR → audio multilingue

## Objectif & brief
POC où un visiteur **scanne un QR code** (collé sur un artefact / une expérience) →
les **lunettes Ray-Ban Meta jouent un audio explicatif** dans la **langue choisie**,
via les haut-parleurs *open-ear*.

Cible de test : **au moins 10 QR codes**, en **plusieurs langues**. La **génération des
QR** fait partie du POC.

## Contexte
Construit pour l'**Agentic Livepoint**, le showroom du **Lab IA de Onepoint**
(ouverture **15 juillet 2026**). C'est un environnement de démonstration fermé
(visiteurs guidés), ce qui autorise une distribution d'app à des testeurs internes.

## Faits techniques clés
- **En natif, ça ne suffit pas** : « Hey Meta, scan this QR » renvoie juste un lien sur
  le téléphone, **aucun audio sur les lunettes**. → Il faut une **app custom**.
- **Les apps ne tournent PAS sur les lunettes.** Le **Meta Wearables Device Access
  Toolkit (DAT SDK)** donne accès à la **caméra** (via le toolkit) et au
  **micro / haut-parleurs** (via Bluetooth). **L'app tourne sur le TÉLÉPHONE**
  (iOS Swift ou Android Kotlin).
- **Un QR ne contient pas d'audio.** Il encode un **identifiant court** ; l'app va
  chercher le texte associé puis **synthétise l'audio**.
- **SDK en preview** (déc. 2025). Distribution à des **testeurs internes** possible
  (parfait pour un showroom fermé).
- **Développement sans lunettes possible** : **Mock device** (SDK officiel) +
  **phone mode** (VisionClaw) → on développe et teste toute la chaîne sans matériel.

## Décision d'architecture — Voie A (déterministe)
```
QR (encode un ID court)
  → l'app décode l'ID
  → lookup du contenu (content/content.json : ID → texte par langue)
  → ElevenLabs TTS dans la langue choisie
  → lecture audio (haut-parleur des lunettes via Bluetooth ;
                   téléphone / laptop en phase de test)
```
**Voie B** (hors POC, notée comme **évolution v2**) = pipeline vision type
VisionClaw / OpenClaw / Gemini Live qui **interprète l'image** au lieu de lire un ID.

## Stack par phase
| Phase | Quoi | Stack |
|-------|------|-------|
| 1 | Prototype logique **local** (priorité) | **Python** : génération QR → décodage → lookup → **ElevenLabs TTS** → lecture audio |
| 2 | App mobile | **iOS Swift + DAT SDK** (en **mock device**) |
| 3 | Intégration matériel | **Ray-Ban Meta Gen 2** (caméra + haut-parleurs open-ear) |

TTS : **ElevenLabs** (multilingue) sur toutes les phases.

## Structure du repo
| Dossier | Rôle |
|---------|------|
| `content/` | `content.json` : ID → texte par langue (source de vérité du contenu) |
| `qr-codes/` | script de génération des QR + `out/` (sorties, gitignored) |
| `pipeline/` | prototype phone-mode (phase 1, Python) |
| `app/` | app mobile Swift (phase 2 — vide pour l'instant) |
| `reference/` | repos clonés en **lecture seule** (modèles ; **gitignored**) |
| `docs/` | specs, archi, notes de faisabilité |

## Repos de référence (`reference/`, gitignored)
| Repo | À quoi ça sert |
|------|----------------|
| `OpenGlass` (DarlingtonDeveloper) | Implémentation **iOS Swift de référence** : mode QR + pipeline audio → haut-parleur. **Le match le plus proche.** |
| `VisionClaw` (sseanliu) | POC fondateur MIT, **« phone mode »** pour tester sans lunettes. |
| `meta-wearables-dat-ios` (facebook) | **SDK officiel iOS** : camera streaming, **mock device**, plugins Claude Code / Cursor. |

## Phases de build
1. **Prototype logique LOCAL** (Python, sans lunettes) : génération QR → décodage →
   lookup → ElevenLabs TTS → lecture audio. **Priorité** — prouve toute la chaîne.
2. **App mobile** (iOS Swift + DAT SDK, en mock device).
3. **Intégration vraies lunettes** Ray-Ban Meta Gen 2 (caméra + haut-parleurs open-ear).

## Conventions & contraintes
- **Aucun secret dans le repo.** La clé **ElevenLabs** vit dans un **`.env` (gitignored)**,
  lue en **variable d'environnement**. Jamais en clair.
- **`reference/` est gitignored** → pas de repos git imbriqués.
- **Mac corporate sans droits admin** (à garder en tête pour Xcode en phase 2).
- **On avance step by step** : à chaque étape, montrer le résultat et **attendre
  validation** avant de continuer.

## Journal
- **2026-06-22** — Bootstrap du projet : structure de dossiers créée, `.gitignore`,
  clone des 3 repos de référence (OpenGlass, VisionClaw, meta-wearables-dat-ios),
  rédaction de `CLAUDE.md` et `README.md`. Aucun code feature écrit (prochaine étape).
- **2026-06-22** — Génération QR + content.json : `content/content.json` (10 entrées
  `artefact-01..10`, langues fr/en/es/de, schéma documenté en tête de fichier) ;
  `qr-codes/generate_qr.py` (+ `requirements.txt`) qui lit les IDs depuis content.json,
  encode `labqr:<id>` (préfixe pour distinguer nos QR), génère un PNG par ID (niveau H,
  820×890 px, ID en clair) + une planche contact. Section "Génération des QR" ajoutée au
  README. Pipeline non touché (prochain prompt).
- **2026-06-22** — Pipeline phase 1 (local) : `pipeline/qr_audio_pipeline.py` — décodage
  QR via OpenCV (`cv2.QRCodeDetector`, pas de zbar) en modes `--image` et `--webcam` ;
  parsing `labqr:<id>` (rejet propre des QR non reconnus) ; lookup `content.json` avec
  `--lang` et fallback fr ; TTS ElevenLabs (`eleven_multilingual_v2`, clé via `.env`) avec
  cache `pipeline/audio_cache/<id>_<lang>.mp3` (`--no-cache`) ; lecture via `afplay`
  (fallback `open`) ; flag `--no-tts`. `test_decode.py` valide le round-trip 10/10.
  `requirements.txt` (opencv-python, requests, python-dotenv) + `.env.example`. Section
  "Pipeline (phase 1)" ajoutée au README. NB : `from __future__ import annotations` pour
  rester compatible Python 3.9. Étape A (décodage+lookup) validée ; Étape B (TTS) en attente
  de la clé + validation ; `--webcam` codé mais test à valider.
