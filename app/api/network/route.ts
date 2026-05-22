import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function getUserId(req: NextRequest): string | null {
  const accessToken = req.headers.get("x-access-token");
  if (!accessToken) return null;
  const [, rawPayload] = accessToken.split(".");
  if (!rawPayload) return null;
  try {
    const padded = rawPayload + "=".repeat((4 - rawPayload.length % 4) % 4);
    const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf-8")) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("network_contacts")
    .select("*")
    .eq("user_id", userId)
    .order("last_interaction", { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as Partial<{
    name: string; email: string; phone: string; company: string;
    connection_source: string; last_interaction: string | null; discussion_notes: string;
  }> | null;

  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = (body.name ?? "").trim();
  const company = (body.company ?? "").trim();
  if (!name || !company) {
    return NextResponse.json({ error: "Name and company are required" }, { status: 400 });
  }

  const insert = {
    user_id: userId,
    name,
    company,
    email: (body.email ?? "").trim(),
    phone: (body.phone ?? "").trim(),
    connection_source: body.connection_source ?? "",
    last_interaction: body.last_interaction || null,
    discussion_notes: body.discussion_notes ?? "",
  };

  const { data, error } = await supabaseAdmin
    .from("network_contacts")
    .insert(insert)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}
