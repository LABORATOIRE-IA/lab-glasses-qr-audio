"use client";

// useBaseUrl — base URL des QR, partagée galerie + admin.
//
// NEXT_PUBLIC_BASE_URL (prod, inliné au build) sinon l'origine courante (localhost dev).
// `baseConfigured` pilote la bannière ambre : sans NEXT_PUBLIC_BASE_URL, les QR pointent
// vers localhost et ne sont pas scannables hors de cette machine.

import { useEffect, useState } from "react";

export function useBaseUrl() {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return {
    baseUrl: envBase || origin,
    baseConfigured: !!envBase,
    origin,
  };
}
