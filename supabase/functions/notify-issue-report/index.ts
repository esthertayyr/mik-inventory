import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = request.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Sign in required" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const { issueId } = await request.json();
    if (!issueId) throw new Error("Issue report is required");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: issue, error } = await admin
      .from("issue_reports")
      .select("id,reported_by,category,message,created_at,business:businesses(name)")
      .eq("id", issueId)
      .single();
    if (error || !issue || issue.reported_by !== user.id)
      return new Response(JSON.stringify({ error: "Report not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("Email service is not configured");
    const shopName = Array.isArray(issue.business) ? issue.business[0]?.name : issue.business?.name;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "MIK Reports <onboarding@resend.dev>",
        to: ["esther.tayyr@gmail.com"],
        subject: `[MIK] New ${issue.category} problem from ${shopName ?? "a shop"}`,
        text: `A new problem was reported in MIK.\n\nShop: ${shopName ?? "Unknown shop"}\nArea: ${issue.category}\nTime: ${issue.created_at}\n\n${issue.message}\n\nOpen the MIK Owner dashboard to review and close this report.`,
      }),
    });
    if (!response.ok) throw new Error(`Email service returned ${response.status}`);
    await admin.from("issue_reports").update({ email_sent_at: new Date().toISOString(), email_error: null }).eq("id", issue.id);
    return new Response(JSON.stringify({ sent: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Email not sent" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
