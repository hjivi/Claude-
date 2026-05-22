import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { anthropic } from "@/lib/anthropic";
import { MASTER_SKILLS } from "@/lib/skills";
import type { Anecdote } from "@/lib/types";

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

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: anecdote, error: fetchErr } = await supabaseAdmin
    .from("anecdotes")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!anecdote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const a = anecdote as Anecdote;

  const prompt = `Based on the following STAR anecdote content, identify up to 20 relevant professional skills from this taxonomy: ${MASTER_SKILLS.join(", ")}. Return a JSON array of skill tag strings only, maximum 20 items, ordered by relevance. Return JSON only, no markdown, no explanation.

ANECDOTE:
Company: ${a.company}
Role: ${a.job_title}
Date Range: ${a.date_range}

SITUATION:
${a.situation_bullets.map((b) => `- ${b}`).join("\n")}

TASK:
${a.task_bullets.map((b) => `- ${b}`).join("\n")}

ACTION:
${a.action_bullets.map((b) => `- ${b}`).join("\n")}

RESULT:
${a.result_bullets.map((b) => `- ${b}`).join("\n")}

LONG-TERM IMPLICATIONS:
${a.long_term_implications}`;

  let tags: string[] = [];
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as unknown;
      if (Array.isArray(parsed)) {
        const allowed = new Set(MASTER_SKILLS);
        tags = parsed
          .filter((t): t is string => typeof t === "string")
          .filter((t) => allowed.has(t))
          .slice(0, 20);
      }
    }
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string }).message ?? "AI call failed" }, { status: 500 });
  }

  const { error: updateErr } = await supabaseAdmin
    .from("anecdotes")
    .update({ skill_tags: tags })
    .eq("id", params.id)
    .eq("user_id", userId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ skill_tags: tags });
}
