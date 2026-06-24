import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agentic Livepoint — Audio",
  description:
    "Showroom du Lab IA de Onepoint : scannez un QR code, écoutez l'explication dans votre langue.",
};

// Mobile-first : la page est consultée au téléphone, pas de zoom intempestif.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
