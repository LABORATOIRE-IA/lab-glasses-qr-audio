// Page visiteur /play/<id> (Server Component).
// Lit content.json pour l'id, gère proprement l'id inconnu, délègue la lecture
// au composant client Player (boutons langue + tap-to-play).

import { allIds, getEntry } from "@/lib/content";
import Player from "./Player";

// Pré-génère les pages des artefacts connus au build (le reste reste géré à la volée).
export function generateStaticParams() {
  return allIds().map((id) => ({ id }));
}

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = getEntry(id);

  // id inconnu : message clair, jamais de page blanche.
  if (!entry) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-5xl" aria-hidden>
          🤷
        </p>
        <h1 className="text-xl font-semibold">QR non reconnu</h1>
        <p className="text-neutral-600">
          L&apos;identifiant «&nbsp;{id}&nbsp;» n&apos;existe pas dans le contenu
          de la visite.
        </p>
      </main>
    );
  }

  return <Player id={id} titles={entry.title} texts={entry.text} />;
}
