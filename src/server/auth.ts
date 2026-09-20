import type { Env } from "./db";
import { id } from "./db";

const encoder = new TextEncoder();
const b64 = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64 = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
async function signature(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
export async function getSession(
  request: Request,
  env: Env,
  creatorId: string,
  slug: string,
): Promise<{ userId: string; cookie?: string }> {
  const secret =
    env.SESSION_SECRET ||
    (env.APP_ENV === "local" ? "local-demo-secret-not-for-production" : "");
  if (!secret) throw new Error("SESSION_SECRET is required");
  const name = `cap_session_${slug.replace(/[^a-z0-9-]/g, "")}`;
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (raw) {
    const [userId, sig] = raw.split(".");
    if (
      userId &&
      sig &&
      sig === (await signature(secret, `${creatorId}.${userId}`))
    ) {
      const row = await env.DB.prepare(
        "SELECT id FROM users WHERE id=? AND creator_id=?",
      )
        .bind(userId, creatorId)
        .first();
      if (row) return { userId };
    }
  }
  const userId = id();
  const sig = await signature(secret, `${creatorId}.${userId}`);
  await env.DB.prepare(
    "INSERT INTO users(id,creator_id,session_hash) VALUES(?,?,?)",
  )
    .bind(userId, creatorId, sig)
    .run();
  const secure = env.APP_ENV === "local" ? "" : "; Secure";
  return {
    userId,
    cookie: `${name}=${userId}.${sig}; HttpOnly; SameSite=Lax; Path=/api/${slug}; Max-Age=31536000${secure}`,
  };
}
export function checkOrigin(request: Request, env: Env): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const expected = new URL(request.url).origin;
  return (
    origin === expected ||
    (env.APP_ENV === "local" &&
      ["http://127.0.0.1:5173", "http://localhost:5173"].includes(origin))
  );
}
export type AdminRole = "owner" | "operator" | "analyst";
export async function getAdminRole(
  request: Request,
  env: Env,
): Promise<AdminRole | null> {
  if (
    env.APP_ENV === "local" &&
    request.headers
      .get("cookie")
      ?.split(";")
      .map((value) => value.trim())
      .includes("cap_local_admin=1")
  )
    return "owner";
  if (
    env.APP_ENV === "local" &&
    env.ADMIN_DEV_TOKEN &&
    request.headers.get("authorization") === `Bearer ${env.ADMIN_DEV_TOKEN}`
  )
    return "owner";
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token || !env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) return null;
  try {
    const [headerPart, payloadPart, signaturePart] = token.split(".");
    if (!headerPart || !payloadPart || !signaturePart) return null;
    const header = JSON.parse(
      new TextDecoder().decode(fromB64(headerPart)),
    ) as { kid?: string; alg?: string };
    const payload = JSON.parse(
      new TextDecoder().decode(fromB64(payloadPart)),
    ) as { aud?: string[]; iss?: string; exp?: number; email?: string };
    const issuer = `https://${env.CF_ACCESS_TEAM_DOMAIN}`;
    if (
      header.alg !== "RS256" ||
      !header.kid ||
      !payload.aud?.includes(env.CF_ACCESS_AUD) ||
      payload.iss !== issuer ||
      !payload.exp ||
      payload.exp * 1000 < Date.now() ||
      !payload.email
    )
      return null;
    const jwksResponse = await fetch(`${issuer}/cdn-cgi/access/certs`);
    if (!jwksResponse.ok) return null;
    const jwks = (await jwksResponse.json()) as {
      keys: Array<JsonWebKey & { kid?: string }>;
    };
    const jwk = jwks.keys.find((key) => key.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    if (
      !(await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        fromB64(signaturePart),
        encoder.encode(`${headerPart}.${payloadPart}`),
      ))
    )
      return null;
    const admin = await env.DB.prepare(
      "SELECT role FROM admin_users WHERE email=?",
    )
      .bind(payload.email.toLowerCase())
      .first<{ role: string }>();
    return admin && ["owner", "operator", "analyst"].includes(admin.role)
      ? (admin.role as AdminRole)
      : null;
  } catch {
    return null;
  }
}
