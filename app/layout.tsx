import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// Poppins (charte Onepoint), self-hosted par next/font : téléchargé au build et servi
// depuis notre domaine, exposé en variable CSS --font-poppins (cf. tailwind fontFamily.sans).
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

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
    <html lang="fr" className={poppins.variable}>
      <body className="min-h-screen bg-neutral-50 font-sans text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
