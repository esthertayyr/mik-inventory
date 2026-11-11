import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const BUSINESS = "3fe4c82d-a659-406b-b290-32d8a49f2bdf";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const fail = (message: string, status = 400) => json({ error: message }, status);

function enc(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
function decode(value: string) { return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0)); }
async function digest(value: string) { return enc(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }
async function seal(value: string) {
  const raw = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("Google Drive connector is not fully configured yet.");
  const key = await crypto.subtle.importKey("raw", decode(raw), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `${enc(iv)}.${enc(new Uint8Array(cipher))}`;
}
async function unseal(value: string) {
  const raw = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("Google Drive connector is not fully configured yet.");
  const [iv, cipher] = value.split(".");
  const key = await crypto.subtle.importKey("raw", decode(raw), "AES-GCM", false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv) }, key, decode(cipher)));
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Method not allowed", 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!, serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return fail("Sign in to MIK first.", 401);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return fail("Your MIK session has expired. Sign in again.", 401);
    const user = authData.user;
    const { data: membership } = await admin.from("business_memberships").select("role").eq("business_id", BUSINESS).eq("user_id", user.id).maybeSingle();
    const { data: staff } = await admin.from("shop_staff_accounts").select("active,permissions").eq("business_id", BUSINESS).eq("user_id", user.id).maybeSingle();
    const isMember = Boolean(membership || staff?.active);
    const isOwner = membership?.role === "owner";
    if (!isMember) return fail("VIAE team access is required.", 403);
    const body = await req.json();
    const action = String(body?.action || "");
    const { data: connection } = await admin.from("viae_drive_connections").select("google_email,drive_folder_id,encrypted_refresh_token,connected_at").eq("business_id", BUSINESS).maybeSingle();
    if (action === "status") {
      if (!connection) return json({ connected: false, canConnect: isOwner });
      const { data: files } = await admin.from("viae_drive_files").select("relative_path,drive_file_id,file_name,mime_type,size_bytes,updated_at").eq("business_id", BUSINESS);
      return json({ connected: true, canConnect: isOwner, email: connection.google_email, folderId: connection.drive_folder_id, connectedAt: connection.connected_at, files: files || [] });
    }
    if (!isOwner) return fail("Only a VIAE owner can connect Drive or upload files.", 403);
    if (action === "start") {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
      if (!clientId || !Deno.env.get("GOOGLE_CLIENT_SECRET") || !Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY")) return fail("Google Drive setup is waiting for the secure Google OAuth settings in MIK.", 503);
      const state = enc(crypto.getRandomValues(new Uint8Array(32)));
      const verifier = enc(crypto.getRandomValues(new Uint8Array(48)));
      const returnTo = String(body.returnTo || "https://mik-inventory.vercel.app/");
      const allowed = ["https://mik-inventory.vercel.app/", "http://localhost:3010/", "http://localhost:3000/", "http://localhost:8081/"];
      if (!allowed.includes(returnTo)) return fail("Invalid MIK return address.");
      const { error } = await admin.from("viae_drive_oauth_states").insert({ state, code_verifier: verifier, user_id: user.id, return_to: returnTo });
      if (error) throw error;
      const redirectUri = `${url}/functions/v1/viae-drive-oauth-callback`;
      const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email https://www.googleapis.com/auth/drive.file", access_type: "offline", prompt: "consent", state, code_challenge: await digest(verifier), code_challenge_method: "S256" });
      return json({ authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }
    if (action === "access") {
      if (!connection) return fail("Connect Google Drive first.", 409);
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!, clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
      const refreshToken = await unseal(connection.encrypted_refresh_token);
      const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) });
      const result = await response.json();
      if (!response.ok || !result.access_token) throw new Error("Google Drive could not refresh its short-lived connection. Reconnect Drive in MIK.");
      return json({ accessToken: result.access_token, expiresIn: result.expires_in, folderId: connection.drive_folder_id });
    }
    if (action === "register") {
      const path = String(body.path || "");
      if (!path || path.length > 700 || path.split(/[\\/]/).some((part: string) => !part || part === "." || part === ".." || part.includes(":"))) return fail("Invalid VIAE library path.");
      const fileId = String(body.fileId || ""), fileName = String(body.fileName || "");
      if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId) || !fileName || fileName.length > 255) return fail("Invalid Google Drive file details.");
      const { error } = await admin.from("viae_drive_files").upsert({ business_id: BUSINESS, relative_path: path, drive_file_id: fileId, file_name: fileName, mime_type: String(body.mimeType || "application/octet-stream").slice(0, 120), size_bytes: Math.max(0, Number(body.sizeBytes) || 0), updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ saved: true });
    }
    return fail("Unknown Drive action.");
  } catch (error) {
    console.error("VIAE Drive connector error", error);
    return fail(error instanceof Error ? error.message : "Google Drive request failed.", 500);
  }
});
