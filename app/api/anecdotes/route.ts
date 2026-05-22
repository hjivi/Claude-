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
    .from("anecdotes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ anecdotes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as Partial<{
    company: string; job_title: string; date_range: string;
  }> | null;

  const insert = {
    user_id: userId,
    company: body?.company?.trim() ?? "",
    job_title: body?.job_title?.trim() ?? "",
    date_range: body?.date_range?.trim() ?? "",
    situation_bullets: [],
    task_bullets: [],
    action_bullets: [],
    result_bullets: [],
    long_term_implications: "",
    skill_tags: [],
    status: "in_process",
    conversation_history: [],
  };

  const { data, error } = await supabaseAdmin
    .from("anecdotes")
    .insert(insert)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ anecdote: data });
}
