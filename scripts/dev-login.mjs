/**
 * Prints a working sign-in link, for local development only.
 *
 * Sign-in is a magic link sent by Supabase Auth to a real inbox. That is
 * correct in production and tedious in development — Supabase's built-in mailer
 * is rate-limited to a handful of messages an hour, which is not enough to test
 * a portal and an owner app in the same afternoon.
 *
 * This mints the same link directly with the service key and prints it. It
 * never sends anything, and it only ever runs from a terminal you already
 * control — the service key it needs is the one that bypasses RLS, so this must
 * stay a local script and must never become a route.
 *
 *   npm run dev:login                     # signs in as OWNER_EMAIL
 *   npm run dev:login -- someone@else.com # signs in as a test customer
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal .env.local reader — no dependency, and it only runs locally. */
function loadEnv() {
  const env = {};

  let raw;
  try {
    raw = readFileSync(join(root, ".env.local"), "utf8");
  } catch {
    fail("No .env.local found. Copy .env.example to .env.local and fill it in.");
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    // Strip one layer of surrounding quotes, as dotenv does.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const env = loadEnv();

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = (env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const email = (process.argv[2] ?? env.OWNER_EMAIL ?? "").trim().toLowerCase();

if (!url || !serviceKey) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env.local.");
if (!email) fail("No email. Set OWNER_EMAIL in .env.local, or pass one: npm run dev:login -- you@example.com");

if (!siteUrl.includes("localhost") && !siteUrl.includes("127.0.0.1")) {
  fail(`NEXT_PUBLIC_SITE_URL is ${siteUrl}, which is not local. This script is for development only.`);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const redirectTo = `${siteUrl}/auth/callback`;

async function generate(type) {
  return admin.auth.admin.generateLink({ type, email, options: { redirectTo } });
}

let { data, error } = await generate("magiclink");

// `magiclink` only works for an account that already exists. The first run for
// a fresh address needs a signup link instead — which is exactly the flow a new
// customer would go through anyway.
if (error && /not found/i.test(error.message)) {
  console.log(`  No account for ${email} yet — creating one.`);
  ({ data, error } = await generate("signup"));
}

if (error) fail(`Supabase refused: ${error.message}`);

/*
 * Deliberately NOT `properties.action_link`.
 *
 * That link routes through Supabase's own /auth/v1/verify, which — for an
 * admin-generated link, since there is no PKCE challenge behind it — answers
 * with the tokens in a `#access_token=…` fragment. A fragment never reaches the
 * server, so the callback cannot complete the sign-in from it directly.
 *
 * `hashed_token` goes straight to our own callback, which verifies it
 * server-side with `verifyOtp`. Same result, one hop, and no tokens in the URL.
 */
const tokenHash = data?.properties?.hashed_token;
const verificationType = data?.properties?.verification_type ?? "magiclink";

if (!tokenHash) fail("Supabase returned no token.");

const link =
  `${siteUrl}/auth/callback` +
  `?token_hash=${encodeURIComponent(tokenHash)}` +
  `&type=${encodeURIComponent(verificationType)}`;

const isOwner = email === (env.OWNER_EMAIL ?? "").trim().toLowerCase();

console.log(`
  Signing in as ${email}${isOwner ? "  (this address is promoted to owner)" : "  (client)"}

  Open this in your browser — it works once:

${link}

  It lands on ${redirectTo} and drops you at ${isOwner ? "/app" : "/portal"}.
`);
