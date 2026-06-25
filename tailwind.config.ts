// ⚠️ Palette PROVISOIRE (#0066cc / #00a39a) — valeurs de travail, PAS la charte
// officielle Onepoint. À remplacer par les hex officiels + le vrai logo « o. »
// quand disponibles.

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Charte Onepoint — base noir/blanc + accents bleu vif / teal.
        // ⚠️ Valeurs de départ (aucune charte de référence dans le repo) :
        // à remplacer par les HEX officiels quand ils seront fournis.
        brand: {
          blue: "#0066cc",
          teal: "#00a39a",
        },
      },
      fontFamily: {
        // Poppins (self-hosted via next/font) injecté en variable CSS dans layout.tsx.
        sans: ["var(--font-poppins)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
