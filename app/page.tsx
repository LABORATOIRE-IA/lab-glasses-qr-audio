// Landing minimale. Le vrai point d'entrée est /play/<id> (atteint via QR code).
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-xs uppercase tracking-widest text-neutral-400">
        Agentic Livepoint
      </p>
      <h1 className="text-2xl font-semibold">Lab IA — Onepoint</h1>
      <p className="text-neutral-600">
        Scannez un QR code de la visite pour écouter l&apos;explication dans
        votre langue.
      </p>
    </main>
  );
}
