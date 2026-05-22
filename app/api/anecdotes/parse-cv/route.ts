import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { anthropic } from "@/lib/anthropic";
import { MASTER_SKILLS } from "@/lib/skills";

export const maxDuration = 60;

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

type ParsedAnecdote = {
  company: string;
  job_title: string;
  date_range: string;
  situation_bullets: string[];
  task_bullets: string[];
  action_bullets: string[];
  result_bullets: string[];
  long_term_implications: string;
  skill_tags: string[];
};

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function sa(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const arrayBuffer = await req.arrayBuffer();
  if (!arrayBuffer.byteLength) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  const buffer = Buffer.from(arrayBuffer);

  let parsed: ParsedAnecdote[] = [];
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
          } as never,
          {
            type: "text",
            text: `You are parsing a CV/resume to extract individual professional accomplishments as anecdotes. For each bullet point or significant achievement in the work history, create a separate anecdote object. For each anecdote extract: company, job_title, date_range, situation_bullets (1-2 items), task_bullets (1-2 items), action_bullets (2-3 items), result_bullets (1-2 items with metrics if present), long_term_implications (one sentence), skill_tags (up to 15 from this list: ${MASTER_SKILLS.join(", ")}). Return a JSON array of anecdote objects. Return JSON only, no markdown, no explanation.`,
          },
        ],
      }],
    });
    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return NextResponse.json({ error: "Could not parse CV content" }, { status: 500 });
    const arr = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(arr)) return NextResponse.json({ error: "Parsed content was not an array" }, { status: 500 });
    const allowed = new Set(MASTER_SKILLS);
    parsed = arr.map((item) => {
      const obj = (item ?? {}) as Record<string, unknown>;
      return {
        company: s(obj.company),
        job_title: s(obj.job_title),
        date_range: s(obj.date_range),
        situation_bullets: sa(obj.situation_bullets),
        task_bullets: sa(obj.task_bullets),
        action_bullets: sa(obj.action_bullets),
        result_bullets: sa(obj.result_bullets),
        long_term_implications: s(obj.long_term_implications),
        skill_tags: sa(obj.skill_tags).filter((t) => allowed.has(t)).slice(0, 20),
      };
    });
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string }).message ?? "AI parse failed" }, { status: 500 });
  }

  if (parsed.length === 0) return NextResponse.json({ count: 0, anecdotes: [] });

  const rows = parsed.map((p) => ({
    user_id: userId,
    company: p.company,
    job_title: p.job_title,
    date_range: p.date_range,
    situation_bullets: p.situation_bullets,
    task_bullets: p.task_bullets,
    action_bullets: p.action_bullets,
    result_bullets: p.result_bullets,
    long_term_implications: p.long_term_implications,
    skill_tags: p.skill_tags,
    status: "in_process",
    conversation_history: [],
  }));

  const { data, error } = await supabaseAdmin.from("anecdotes").insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count: data?.length ?? 0, anecdotes: data ?? [] });
}
