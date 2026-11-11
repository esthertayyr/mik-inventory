import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const BUSINESS = "3fe4c82d-a659-406b-b290-32d8a49f2bdf";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function decode(value: string) { return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0)); }
async function unseal(value: string, raw: string) {
  const [iv, cipher] = value.split(".");
  const key = await crypto.subtle.importKey("raw", decode(raw), "AES-GCM", false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv) }, key, decode(cipher)));
}
function error(message: string, status = 400) { return new Response(JSON.stringify({ error: message }), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } }); }

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Method not allowed", 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: auth, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !auth.user) return error("Sign in to MIK first.", 401);
    const { data: member } = await admin.from("business_memberships").select("user_id").eq("business_id", BUSINESS).eq("user_id", auth.user.id).maybeSingle();
    const { data: staff } = await admin.from("shop_staff_accounts").select("active").eq("business_id", BUSINESS).eq("user_id", auth.user.id).maybeSingle();
    if (!member && !staff?.active) return error("VIAE team access is required.", 403);
    const { path } = await req.json();
    if (typeof path !== "string" || path.length > 700 || path.split(/[\\/]/).some(part => !part || part === "." || part === ".." || part.includes(":"))) return error("Invalid VIAE library path.");
    const [{ data: file }, { data: connection }] = await Promise.all([
      admin.from("viae_drive_files").select("drive_file_id,file_name,mime_type").eq("business_id", BUSINESS).eq("relative_path", path).maybeSingle(),
      admin.from("viae_drive_connections").select("encrypted_refresh_token").eq("business_id", BUSINESS).maybeSingle(),
    ]);
    if (!file) return error("This file is not yet in the MIK Drive library.", 404);
    if (!connection) return error("Google Drive is not connected.", 409);
    const { data: encryptionKey, error: keyError } = await admin.rpc("viae_google_drive_encryption_key");
    if (keyError || !encryptionKey) return error("Private token storage is not ready. Contact MIK support.", 503);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!, refresh_token: await unseal(connection.encrypted_refresh_token, encryptionKey), grant_type: "refresh_token" }) });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) return error("Google Drive needs reconnecting. Ask the VIAE owner to reconnect it in MIK.", 503);
    const result = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.drive_file_id)}?alt=media`, { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!result.ok || !result.body) return error("Google Drive could not return this file.", result.status || 502);
    const safeName = String(file.file_name).replace(/[\r\n"\\]/g, "_");
    const headers = new Headers(cors);
    headers.set("Content-Type", file.mime_type || "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${safeName}"`);
    headers.set("Cache-Control", "private, no-store");
    if (result.headers.get("content-length")) headers.set("Content-Length", result.headers.get("content-length")!);
    return new Response(result.body, { headers });
  } catch (errorValue) {
    console.error("VIAE Drive download failed", errorValue);
    return error(errorValue instanceof Error ? errorValue.message : "VIAE file download failed.", 500);
  }
});
