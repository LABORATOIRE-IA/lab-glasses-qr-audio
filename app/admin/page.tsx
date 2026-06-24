import AdminClient from "./AdminClient";

export const metadata = {
  title: "Admin — contenu",
};

// Route d'administration LOCALE (npm run dev). Édite content/content.json via l'API
// /api/admin/content (désactivée en prod). Pas de TTS ni QR à cette étape.
export default function AdminPage() {
  return <AdminClient />;
}
