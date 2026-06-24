# Lunettes Ray-Ban Meta : QR → audio multilingue (web app)

POC pour l'**Agentic Livepoint** (showroom du Lab IA de Onepoint).
Un visiteur **scanne un QR code** posé sur un artefact → son téléphone ouvre une
**page web** → il choisit sa langue et touche **« ▶ Écouter »** → l'audio sort dans
les **lunettes Ray-Ban Meta** (haut-parleurs *open-ear*, via Bluetooth).

## Architecture (pivot web)
```
QR (encode <BASE_URL>/play/<id>)
  → la page /play/<id> lit content.json (texte par langue)
  → joue un mp3 PRÉ-GÉNÉRÉ /audio/<id>-<lang>.mp3
```
- **Génération de l'audio = LOCAL uniquement** (`scripts/generate-audio.mjs`, ElevenLabs).
- **Prod = mp3 statiques.** Aucune clé, aucun appel ElevenLabs au runtime.

> Hypothèse critique testée par ce POC : *le son route-t-il bien vers les lunettes
> quand on touche « ▶ Écouter » dans le navigateur ?* Tout le reste (admin, 40 clips)
> n'est construit qu'**après** validation de ce test.

## Stack
Next.js (App Router) + TypeScript + Tailwind · déploiement **Vercel** ·
stockage = **fichiers + git** (pas de base de données).

## Structure
| Dossier | Rôle |
|---------|------|
| `app/` | Next.js : `play/[id]/` = page visiteur (`page.tsx` + `Player.tsx`) |
| `lib/content.ts` | accès typé à `content.json` (source unique) |
| `scripts/generate-audio.mjs` | génération mp3 ElevenLabs (**local**) |
| `public/audio/` | mp3 pré-générés, servis en statique (**versionnés**) |
| `content/content.json` | **source de vérité** : textes par langue |
| `qr-codes/generate_qr.py` | génère les QR `<BASE_URL>/play/<id>` |
| `pipeline/` | héritage Phase 1 : `pronunciations.json`, `.env` (clé) |

## Modèle de données — `content/content.json`
Source de vérité **unique** (ne pas dupliquer). Chaque clé de premier niveau (hors
`_schema`) est un **id d'artefact** (`artefact-01` … `artefact-10`) :
```json
"artefact-01": {
  "title": "Bienvenue",
  "lang": { "fr": "…", "en": "…", "es": "…", "de": "…" }
}
```
- `title` : libellé court (interne / planche contact QR).
- `lang` : texte par code langue (`fr`, `en`, `es`, `de`). Ajouter une langue = ajouter
  une clé (et générer les mp3 correspondants) — aucun changement de code.
- Les clés préfixées `_` (ex. `_schema`) sont des métadonnées, ignorées partout.

---

## (a) Développement local
```bash
npm install
npm run dev          # http://localhost:3000  → page visiteur : /play/artefact-01
```

## (b) Générer l'audio (LOCAL uniquement)
La clé vit dans **`.env.local`** (gitignored, reprise de `pipeline/.env`) :
```
ELEVENLABS_API_KEY=…        # LOCAL UNIQUEMENT — jamais en prod
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```
```bash
# tout (10 ids × 4 langues), saute les mp3 déjà présents :
npm run gen:audio
# cibler un id / une langue :
node --env-file=.env.local scripts/generate-audio.mjs --id artefact-01 --lang fr
# régénérer (ignore l'existant) — ex. après modif de pronunciations.json :
node --env-file=.env.local scripts/generate-audio.mjs --force
```
Sortie : `public/audio/<id>-<lang>.mp3`. **Ces fichiers sont versionnés** (c'est tout
ce que sert la prod). Normalisation de prononciation appliquée avant l'appel
(table [`pipeline/pronunciations.json`](pipeline/pronunciations.json), ex. `IA → I.A.`,
remplacement **mot entier, sensible à la casse**).

## (c) Déployer sur Vercel
```bash
npm i -g vercel        # si besoin
vercel                 # 1er déploiement (preview) — suivre les invites
vercel --prod          # déploiement production → renvoie l'URL de prod
```
> 🔒 **NE PAS** ajouter `ELEVENLABS_API_KEY` (ni VOICE/MODEL) dans les variables
> d'environnement Vercel. La prod ne sert que des mp3 statiques : aucune clé n'y a sa
> place. `.env.local` est gitignored et n'est jamais envoyé.

## (d) Générer les QR (une fois l'URL de prod connue)
```bash
python3 -m venv .venv
.venv/bin/pip install -r qr-codes/requirements.txt

# le QR de test du POC :
BASE=https://<ton-app>.vercel.app
.venv/bin/python qr-codes/generate_qr.py --base-url "$BASE" --id artefact-01
# les 10 QR + planche contact à imprimer :
.venv/bin/python qr-codes/generate_qr.py --base-url "$BASE"
```
Chaque QR encode `<BASE_URL>/play/<id>` (niveau H, ≥ 600 px, id en clair dessous).
Sorties dans `qr-codes/out/` (gitignored) ; `_contact-sheet.png` = planche contact.

## Détails
Voir [`CLAUDE.md`](./CLAUDE.md) pour le contexte, les faits techniques et les conventions.
