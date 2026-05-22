import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { anthropic } from "@/lib/anthropic";
import type { Anecdote, ConversationMessage } from "@/lib/types";

const MAX_HISTORY_MESSAGES = 20; // last 10 exchanges
const VALID_SECTIONS = ["situation", "task", "action", "result", "implications", "tags"] as const;
type Section = typeof VALID_SECTIONS[number];

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

function buildSystemPrompt(a: Anecdote, section: Section): string {
  return `You are an expert career coach helping a professional build a detailed STAR anecdote for their job application. Your goal is to extract the richest, most specific, and most quantified version of their experience possible.

Current anecdote state:
${JSON.stringify({
    company: a.company,
    job_title: a.job_title,
    date_range: a.date_range,
    situation_bullets: a.situation_bullets,
    task_bullets: a.task_bullets,
    action_bullets: a.action_bullets,
    result_bullets: a.result_bullets,
    long_term_implications: a.long_term_implications,
  }, null, 2)}

Current focus section: ${section}

Rules:
- Ask only ONE question at a time
- Ask 3-5 questions per section, adapting depth to the richness of user responses
- If an answer is vague, probe for specifics: numbers, names, timeframes, decisions made, obstacles overcome
- If an answer is already detailed, acknowledge it and move forward
- After gathering enough for a section, output a bulleted summary PREFIXED with exactly: SECTION_SUMMARY: followed by a JSON array of bullet strings on the next line (e.g. SECTION_SUMMARY:\n["bullet 1","bullet 2"])
- Be warm, specific, and encouraging — reference what the user actually said
- Never ask more than 5 questions on one section without producing a SECTION_SUMMARY
- Total conversation should complete within 25 exchanges`;
}

function extractSectionSummary(reply: string): string[] | null {
  const idx = reply.indexOf("SECTION_SUMMARY:");
  if (idx < 0) return null;
  const tail = reply.slice(idx + "SECTION_SUMMARY:".length);
  const match = tail.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const arr = JSON.parse(match[0]) as unknown;
    if (Array.isArray(arr)) {
      return arr.filter((x): x is string => typeof x === "string");
    }
  } catch {
    return null;
  }
  return null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as { message?: string; section?: string } | null;
  if (!body || typeof body.message !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const section: Section = VALID_SECTIONS.includes(body.section as Section)
    ? (body.section as Section)
    : "situation";

  const { data: anecdote, error: fetchErr } = await supabaseAdmin
    .from("anecdotes")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!anecdote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const a = anecdote as Anecdote;
  const isInit = body.message === "__init__";
  const userText = body.message.trim();

  // Trim stored history to last MAX_HISTORY_MESSAGES, then build outgoing messages.
  const priorHistory: ConversationMessage[] = (a.conversation_history ?? []).slice(-MAX_HISTORY_MESSAGES);

  const claudeMessages: { role: "user" | "assistant"; content: string }[] =
    priorHistory.map((m) => ({ role: m.role, content: m.content }));

  if (isInit) {
    // Seed an initial prompt asking the coach to open the conversation.
    claudeMessages.push({
      role: "user",
      content: "Please introduce yourself briefly and ask your first question to help me build the Situation portion of this STAR anecdote.",
    });
  } else {
    claudeMessages.push({ role: "user", content: userText });
  }

  let replyText = "";
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: buildSystemPrompt(a, section),
      messages: claudeMessages,
    });
    replyText = response.content[0]?.type === "text" ? response.content[0].text : "";
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string }).message ?? "AI call failed" }, { status: 500 });
  }

  const sectionSummary = extractSectionSummary(replyText);
  const now = new Date().toISOString();

  // Append turn(s) — never store the __init__ sentinel as a user message
  const updatedHistory: ConversationMessage[] = [...(a.conversation_history ?? [])];
  if (!isInit) {
    updatedHistory.push({ role: "user", content: userText, timestamp: now });
  }
  updatedHistory.push({ role: "assistant", content: replyText, timestamp: new Date().toISOString() });

  // Trim stored history
  const trimmed = updatedHistory.slice(-MAX_HISTORY_MESSAGES);

  const { error: updateErr } = await supabaseAdmin
    .from("anecdotes")
    .update({ conversation_history: trimmed })
    .eq("id", params.id)
    .eq("user_id", userId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({
    reply: replyText,
    sectionSummary,
    section,
    history: trimmed,
  });
}
