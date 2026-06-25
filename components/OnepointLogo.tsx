// OnepointLogo — PLACEHOLDER. Aucun asset de logo officiel n'existe dans le repo.
// Rendu typographique « o. » (le point en teal de la charte) volontairement neutre,
// pour ne PAS contrefaire le vrai logo. Dès que l'asset officiel est fourni :
// le déposer dans public/ et remplacer ce composant par
//   <Image src="/onepoint-logo.svg" alt="Onepoint" width={…} height={…} />.

export default function OnepointLogo({ className = "" }: { className?: string }) {
  return (
    <span
      aria-label="Onepoint"
      title="Placeholder logo Onepoint (asset officiel manquant)"
      className={`inline-flex items-baseline font-semibold tracking-tight ${className}`}
    >
      o<span className="text-brand-teal">.</span>
    </span>
  );
}
