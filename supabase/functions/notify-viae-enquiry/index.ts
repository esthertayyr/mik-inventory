import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let id = "";
  try {
    const body = await request.json();
    id = typeof body?.submissionId === "string" ? body.submissionId : "";
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return json({ error: "Invalid enquiry" }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!url || !serviceKey || !resendKey) return json({ error: "Email service is not configured" }, 503);
    const admin = createClient(url, serviceKey);
    const { data: claim, error: claimError } = await admin
      .from("viae_form_submissions")
      .update({ email_notification_claimed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", "3fe4c82d-a659-406b-b290-32d8a49f2bdf")
      .is("email_notification_claimed_at", null)
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claim) return json({ sent: false, duplicate: true });

    const { data: enquiry, error: enquiryError } = await admin
      .from("viae_form_submissions")
      .select("id,form_type,name,email,subject,message,details,created_at")
      .eq("id", id)
      .eq("business_id", "3fe4c82d-a659-406b-b290-32d8a49f2bdf")
      .single();
    if (enquiryError || !enquiry) throw enquiryError ?? new Error("Enquiry not found");

    const details = enquiry.details && typeof enquiry.details === "object" ? enquiry.details as Record<string, unknown> : {};
    const attachmentList = Array.isArray(details.attachments) ? details.attachments as Array<{ name?: string }> : [];
    const attachmentNames = attachmentList.map(item => `• ${String(item.name || "Reference image").slice(0, 160)}`).join("\n");
    const lines = [
      "A new enquiry was submitted on the VIAE website.",
      "",
      `Type: ${enquiry.subject || enquiry.form_type}`,
      `Name: ${enquiry.name}`,
      `Email: ${enquiry.email}`,
      `Received: ${enquiry.created_at}`,
      "",
      String(enquiry.message || "").slice(0, 8000),
      attachmentList.length ? `\nReference images saved in MIK:\n${attachmentNames}` : "",
      "",
      "Open MIK → VIAE → Website enquiries to review the full enquiry and its private image attachments.",
    ].filter(Boolean).join("\n");
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "VIAE Enquiries <onboarding@resend.dev>",
        to: ["viae.ph@gmail.com"],
        subject: `[VIAE] New enquiry from ${String(enquiry.name).slice(0, 100)}`,
        text: lines,
      }),
    });
    if (!emailResponse.ok) throw new Error(`Email provider returned ${emailResponse.status}`);
    return json({ sent: true });
  } catch (error) {
    if (id) {
      const url = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (url && serviceKey) {
        const admin = createClient(url, serviceKey);
        await admin.from("viae_form_submissions").update({ email_notification_claimed_at: null }).eq("id", id).eq("business_id", "3fe4c82d-a659-406b-b290-32d8a49f2bdf");
      }
    }
    console.error("VIAE enquiry email failed", error);
    return json({ error: error instanceof Error ? error.message : "Email could not be sent" }, 500);
  }
});
