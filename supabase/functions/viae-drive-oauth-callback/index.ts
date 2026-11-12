import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const BUSINESS = "3fe4c82d-a659-406b-b290-32d8a49f2bdf";
const ALLOWED_GOOGLE_EMAIL = "viaeph@gmail.com";
function decode(value: string) { return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0)); }
function enc(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
async function seal(value: string, raw: string) {
  const key = await crypto.subtle.importKey("raw", decode(raw), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return `${enc(iv)}.${enc(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value))))}`;
}
function redirect(to: string, state: string) { const url = new URL(to); url.searchParams.set("viae_drive", state); return Response.redirect(url.toString(), 303); }
async function googleJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(String(data?.error_description || data?.error?.message || data?.error || "Google request failed"));
  return data;
}

Deno.serve(async request => {
  const base = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(base, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let returnTo = "https://mik-inventory.vercel.app/";
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get("state") || "";
    const { data: flow, error } = await admin.from("viae_drive_oauth_states").select("state,code_verifier,user_id,return_to,created_at").eq("state", state).maybeSingle();
    if (error || !flow || Date.now() - new Date(flow.created_at).getTime() > 10 * 60 * 1000) throw new Error("This Google approval link expired. Start again from MIK.");
    returnTo = flow.return_to;
    await admin.from("viae_drive_oauth_states").delete().eq("state", state);
    const { data: membership } = await admin.from("business_memberships").select("role").eq("business_id", BUSINESS).eq("user_id", flow.user_id).maybeSingle();
    if (membership?.role !== "owner") throw new Error("Only an active VIAE owner can connect Google Drive.");
    const googleError = url.searchParams.get("error");
    if (googleError) throw new Error("Google Drive access was not approved.");
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Google did not return an approval code.");
    const redirectUri = `${base}/functions/v1/viae-drive-oauth-callback`;
    const token = await googleJson("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!, code, code_verifier: flow.code_verifier, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
    if (!token.refresh_token) throw new Error("Google did not provide offline access. Try connecting again and approve the requested access.");
    const user = await googleJson("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (String(user.email || "").toLowerCase() !== ALLOWED_GOOGLE_EMAIL) throw new Error(`Connect Google Drive using ${ALLOWED_GOOGLE_EMAIL}.`);
    const old = await admin.from("viae_drive_connections").select("drive_folder_id,google_email").eq("business_id", BUSINESS).maybeSingle();
    if (old.data?.google_email && user.email && old.data.google_email.toLowerCase() !== user.email.toLowerCase()) throw new Error("This MIK library is connected to a different Google account. Reconnect using the same account.");
    let folderId = old.data?.drive_folder_id as string | undefined;
    if (!folderId) {
      const folder = await googleJson("https://www.googleapis.com/drive/v3/files?fields=files(id,name,mimeType)&pageSize=100&q=" + encodeURIComponent("name='VIAE MIK Library' and mimeType='application/vnd.google-apps.folder' and trashed=false"), { headers: { Authorization: `Bearer ${token.access_token}` } });
      folderId = folder.files?.[0]?.id;
      if (!folderId) {
        const created = await googleJson("https://www.googleapis.com/drive/v3/files?fields=id,name", { method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "VIAE MIK Library", mimeType: "application/vnd.google-apps.folder" }) });
        folderId = created.id;
      }
    }
    if (!folderId) throw new Error("Google Drive library folder could not be created.");
    const { data: encryptionKey, error: keyError } = await admin.rpc("viae_google_drive_encryption_key");
    if (keyError || !encryptionKey) throw new Error("Private token storage is not ready. Contact MIK support.");
    const { error: saveError } = await admin.from("viae_drive_connections").upsert({ business_id: BUSINESS, google_email: user.email || "Google account", drive_folder_id: folderId, encrypted_refresh_token: await seal(token.refresh_token, encryptionKey), connected_by: flow.user_id, connected_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (saveError) throw saveError;
    return redirect(returnTo, "connected");
  } catch (error) {
    console.error("VIAE Drive OAuth callback failed", error);
    const target = new URL(returnTo);
    target.searchParams.set("viae_drive", "error");
    target.searchParams.set("viae_drive_message", error instanceof Error ? error.message.slice(0, 180) : "Google Drive connection failed.");
    return Response.redirect(target.toString(), 303);
  }
});
