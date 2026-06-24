#!/usr/bin/env node
/**
 * scripts/setup-ca.mjs — Génère .certs/corp-ca.pem depuis le trousseau macOS.
 *
 * Pourquoi : sur Mac corporate, Node (undici/fetch) ne trouve pas les CA racine
 * (interception TLS d'entreprise) → « unable to get local issuer certificate ».
 * curl marche (trousseau système), pas Node. On exporte donc les racines du
 * trousseau vers un bundle PEM que les scripts chargent via NODE_EXTRA_CA_CERTS.
 *
 * ⚠️ Le bundle .certs/corp-ca.pem est GITIGNORED : on ne committe JAMAIS de certificats.
 *    À (re)lancer une fois par poste : `npm run setup:ca`.
 *
 * macOS uniquement (commande `security`). Sur un autre OS, configure
 * NODE_EXTRA_CA_CERTS manuellement.
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, ".certs");
const OUT = join(OUT_DIR, "corp-ca.pem");

if (process.platform !== "darwin") {
  console.error(
    "setup:ca — prévu pour macOS. Sur un autre OS, configure NODE_EXTRA_CA_CERTS à la main.",
  );
  process.exit(0);
}

const KEYCHAINS = [
  "/Library/Keychains/System.keychain",
  "/System/Library/Keychains/SystemRootCertificates.keychain",
];

let pem = "";
for (const kc of KEYCHAINS) {
  try {
    pem += execSync(`security find-certificate -a -p "${kc}"`, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    console.warn(`⚠️  lecture impossible : ${kc} (${e.message})`);
  }
}

if (!pem.includes("BEGIN CERTIFICATE")) {
  console.error("❌ Aucun certificat exporté. Abandon.");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, pem, "utf8");

const count = (pem.match(/BEGIN CERTIFICATE/g) || []).length;
console.log(`✅ ${count} certificats → .certs/corp-ca.pem`);
console.log("   (gitignored — ne JAMAIS committer ce bundle.)");
