"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Spinner, PageSpinner } from "@/components/Spinner";
import { createBrowserSupabase } from "@/lib/supabase";
import { MASTER_SKILLS } from "@/lib/skills";
import type { Anecdote, ConversationMessage } from "@/lib/types";

type Section = "situation" | "task" | "action" | "result" | "implications" | "tags";

type SavePayload = Partial<Pick<Anecdote,
  "company" | "job_title" | "date_range" |
  "situation_bullets" | "task_bullets" | "action_bullets" | "result_bullets" |
  "long_term_implications" | "skill_tags" | "status" | "conversation_history"
>>;

const AUTOSAVE_MS = 2000;

export default function AnecdoteDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [anecdote, setAnecdote] = useState<Anecdote | null>(null);

  // Save indicator
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Skill tag refresh
  const [tagRefreshing, setTagRefreshing] = useState(false);
  const lastTagRefreshContentRef = useRef<string>("");
  const [contentChangedSinceTagRefresh, setContentChangedSinceTagRefresh] = useState(false);

  // Tag autocomplete
  const [tagInput, setTagInput] = useState("");

  // Chat
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [currentSection, setCurrentSection] = useState<Section>("situation");
  const [pendingSummary, setPendingSummary] = useState<{ section: Section; bullets: string[] } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInitedRef = useRef(false);

  // Collapsibles
  const [openSections, setOpenSections] = useState<Record<Section, boolean>>({
    situation: true, task: true, action: true, result: true, implications: true, tags: true,
  });

  // ---- Load ----
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const t = data.session?.access_token ?? null;
      setToken(t);
      if (!t) { setLoading(false); return; }
      const res = await fetch(`/api/anecdotes/${params.id}`, { headers: { "x-access-token": t } });
      const json = await res.json() as { anecdote?: Anecdote; error?: string };
      if (res.ok && json.anecdote) {
        setAnecdote(json.anecdote);
        lastTagRefreshContentRef.current = bulletSignature(json.anecdote);
      }
      setLoading(false);
    })();
  }, [supabase, params.id]);

  // ---- Auto-save (debounced) ----
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPayloadRef = useRef<SavePayload>({});

  const flushSave = useCallback(async () => {
    if (!token || !anecdote) return;
    const payload = pendingPayloadRef.current;
    if (Object.keys(payload).length === 0) return;
    pendingPayloadRef.current = {};
    setSaving(true);
    try {
      const res = await fetch(`/api/anecdotes/${anecdote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-access-token": token },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSavedAt(Date.now());
        // detect tag-affecting change
        const sig = bulletSignature({ ...anecdote, ...payload } as Anecdote);
        if (sig !== lastTagRefreshContentRef.current) setContentChangedSinceTagRefresh(true);
      }
    } finally {
      setSaving(false);
    }
  }, [token, anecdote]);

  const scheduleSave = useCallback((patch: SavePayload) => {
    pendingPayloadRef.current = { ...pendingPayloadRef.current, ...patch };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void flushSave(); }, AUTOSAVE_MS);
  }, [flushSave]);

  // ---- Helpers ----
  const update = useCallback(<K extends keyof Anecdote>(key: K, value: Anecdote[K]) => {
    setAnecdote((a) => a ? { ...a, [key]: value } : a);
    scheduleSave({ [key]: value } as SavePayload);
  }, [scheduleSave]);

  const updateBullets = useCallback((field: "situation_bullets" | "task_bullets" | "action_bullets" | "result_bullets", next: string[]) => {
    update(field, next);
  }, [update]);

  // ---- Status toggle ----
  const handleStatusToggle = (next: "in_process" | "approved") => {
    if (!anecdote || anecdote.status === next) return;
    if (anecdote.status === "approved" && next === "in_process") {
      if (!window.confirm("This anecdote is approved. Reverting will remove it from downstream generation until re-approved. Continue?")) {
        return;
      }
    }
    update("status", next);
  };

  // ---- Skill tags ----
  const refreshSkillTags = async () => {
    if (!token || !anecdote) return;
    // Flush any pending edits first so the server sees current content.
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await flushSave();
    setTagRefreshing(true);
    try {
      const res = await fetch(`/api/anecdotes/${anecdote.id}/skill-tags`, {
        method: "POST",
        headers: { "x-access-token": token },
      });
      const json = await res.json() as { skill_tags?: string[]; error?: string };
      if (res.ok && json.skill_tags) {
        setAnecdote((a) => a ? { ...a, skill_tags: json.skill_tags! } : a);
        lastTagRefreshContentRef.current = bulletSignature({ ...anecdote, skill_tags: json.skill_tags });
        setContentChangedSinceTagRefresh(false);
      }
    } finally {
      setTagRefreshing(false);
    }
  };

  const addTag = (tag: string) => {
    if (!anecdote || !tag || anecdote.skill_tags.includes(tag)) return;
    update("skill_tags", [...anecdote.skill_tags, tag]);
    setTagInput("");
  };
  const removeTag = (tag: string) => {
    if (!anecdote) return;
    update("skill_tags", anecdote.skill_tags.filter((t) => t !== tag));
  };

  const tagSuggestions = useMemo(() => {
    if (!tagInput.trim() || !anecdote) return [];
    const q = tagInput.trim().toLowerCase();
    return MASTER_SKILLS
      .filter((s) => s.toLowerCase().includes(q) && !anecdote.skill_tags.includes(s))
      .slice(0, 8);
  }, [tagInput, anecdote]);

  // ---- Chat ----
  const sendChat = useCallback(async (message: string, sectionOverride?: Section, silent = false) => {
    if (!token || !anecdote) return;
    setChatLoading(true);
    try {
      const res = await fetch(`/api/anecdotes/${anecdote.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-token": token },
        body: JSON.stringify({ message, section: sectionOverride ?? currentSection }),
      });
      const json = await res.json() as {
        reply?: string;
        sectionSummary?: string[] | null;
        section?: Section;
        history?: ConversationMessage[];
        error?: string;
      };
      if (res.ok && json.history) {
        setAnecdote((a) => a ? { ...a, conversation_history: json.history! } : a);
        if (json.sectionSummary && json.section) {
          setPendingSummary({ section: json.section, bullets: json.sectionSummary });
        }
      } else if (!res.ok && !silent) {
        alert(json.error ?? "Chat failed");
      }
    } finally {
      setChatLoading(false);
    }
  }, [token, anecdote, currentSection]);

  // Init chat once on load if history empty
  useEffect(() => {
    if (chatInitedRef.current) return;
    if (!anecdote || !token) return;
    chatInitedRef.current = true;
    if (anecdote.conversation_history.length === 0) {
      void sendChat("__init__", "situation", true);
    }
  }, [anecdote, token, sendChat]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [anecdote?.conversation_history.length, chatLoading]);

  const handleChatSubmit = () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    void sendChat(msg);
  };

  const applySummaryToForm = () => {
    if (!pendingSummary || !anecdote) return;
    const { section, bullets } = pendingSummary;
    if (section === "situation") update("situation_bullets", bullets);
    else if (section === "task") update("task_bullets", bullets);
    else if (section === "action") update("action_bullets", bullets);
    else if (section === "result") update("result_bullets", bullets);
    else if (section === "implications") update("long_term_implications", bullets.join(" "));
    else if (section === "tags") update("skill_tags", bullets.filter((b) => MASTER_SKILLS.includes(b)));
    // Advance section
    const order: Section[] = ["situation", "task", "action", "result", "implications", "tags"];
    const idx = order.indexOf(section);
    if (idx >= 0 && idx < order.length - 1) setCurrentSection(order[idx + 1]);
    setPendingSummary(null);
  };

  if (loading) {
    return (
      <>
        <Sidebar />
        <main className="ml-56 min-h-screen bg-background">
          <PageSpinner label="Loading anecdote..." />
        </main>
      </>
    );
  }

  if (!anecdote) {
    return (
      <>
        <Sidebar />
        <main className="ml-56 min-h-screen bg-background p-8">
          <p className="text-sm font-dm-sans text-text-primary">Anecdote not found.</p>
          <button
            onClick={() => router.push("/anecdotes")}
            className="text-sm text-text-dimmed hover:text-text-primary mt-2"
          >
            ← Back to Anecdotes
          </button>
        </main>
      </>
    );
  }

  return (
    <>
      <Sidebar />
      <main className="ml-56 min-h-screen bg-background">
        <div className="flex h-screen overflow-hidden">
          {/* LEFT — STAR form */}
          <div className="flex-[3] overflow-y-auto p-6 border-r border-border">
            <button
              onClick={() => router.push("/anecdotes")}
              className="text-text-dimmed hover:text-text-primary text-sm font-dm-sans mb-4 transition-all duration-[150ms]"
            >
              ← Back to Anecdotes
            </button>

            <div className="space-y-2 mb-4">
              <input
                value={anecdote.company}
                onChange={(e) => update("company", e.target.value)}
                placeholder="Company"
                className="w-full font-syne font-bold text-2xl text-text-primary bg-transparent border-0 focus:outline-none placeholder:text-text-dimmed"
              />
              <input
                value={anecdote.job_title}
                onChange={(e) => update("job_title", e.target.value)}
                placeholder="Job title"
                className="w-full font-dm-sans text-base text-text-primary bg-transparent border-0 focus:outline-none placeholder:text-text-dimmed"
              />
              <input
                value={anecdote.date_range}
                onChange={(e) => update("date_range", e.target.value)}
                placeholder="Jan 2023 – Jun 2024"
                className="w-full font-dm-sans text-sm text-text-dimmed bg-transparent border-0 focus:outline-none placeholder:text-text-dimmed"
              />
            </div>

            <div className="flex items-center justify-between mb-6">
              <div className="flex gap-2">
                {(["in_process", "approved"] as const).map((s) => {
                  const active = anecdote.status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => handleStatusToggle(s)}
                      className={`text-xs rounded-[8px] px-3 py-1.5 font-dm-sans transition-all duration-[150ms] ${
                        active ? "bg-btn-bg text-btn-text" : "border border-border text-text-dimmed hover:text-text-primary"
                      }`}
                    >
                      {s === "in_process" ? "In Process" : "Approved"}
                    </button>
                  );
                })}
              </div>
              <SaveIndicator saving={saving} savedAt={savedAt} />
            </div>

            <CollapsibleSection
              title="Situation"
              open={openSections.situation}
              onToggle={() => setOpenSections((o) => ({ ...o, situation: !o.situation }))}
            >
              <BulletList
                bullets={anecdote.situation_bullets}
                onChange={(next) => updateBullets("situation_bullets", next)}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Task"
              open={openSections.task}
              onToggle={() => setOpenSections((o) => ({ ...o, task: !o.task }))}
            >
              <BulletList
                bullets={anecdote.task_bullets}
                onChange={(next) => updateBullets("task_bullets", next)}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Action"
              open={openSections.action}
              onToggle={() => setOpenSections((o) => ({ ...o, action: !o.action }))}
            >
              <BulletList
                bullets={anecdote.action_bullets}
                onChange={(next) => updateBullets("action_bullets", next)}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Result"
              open={openSections.result}
              onToggle={() => setOpenSections((o) => ({ ...o, result: !o.result }))}
            >
              <BulletList
                bullets={anecdote.result_bullets}
                onChange={(next) => updateBullets("result_bullets", next)}
              />
            </CollapsibleSection>

            <div className="mt-6">
              <label className="block font-syne font-semibold text-sm text-text-primary mb-2">
                Long-term implications
              </label>
              <textarea
                value={anecdote.long_term_implications}
                onChange={(e) => update("long_term_implications", e.target.value)}
                rows={3}
                className="w-full border border-border rounded-[8px] px-3 py-2 text-sm font-dm-sans bg-background focus:outline-none focus:ring-1 focus:ring-btn-bg resize-none"
              />
            </div>

            <div className="mt-6 mb-12">
              <div className="flex items-center justify-between mb-2">
                <label className="block font-syne font-semibold text-sm text-text-primary">
                  Skill tags
                </label>
                <button
                  onClick={refreshSkillTags}
                  disabled={tagRefreshing}
                  className="border border-border text-text-dimmed text-xs px-3 py-1 rounded-[8px] hover:text-text-primary disabled:opacity-50 flex items-center gap-1.5"
                >
                  {tagRefreshing && <Spinner size="sm" />}
                  Refresh skill tags
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-2">
                {anecdote.skill_tags.map((t) => (
                  <span
                    key={t}
                    className="bg-surface-secondary text-text-dimmed text-xs px-2 py-0.5 rounded-[8px] flex items-center gap-1"
                  >
                    {t}
                    <button onClick={() => removeTag(t)} className="hover:text-text-primary">×</button>
                  </span>
                ))}
              </div>

              <div className="relative">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Type to add a skill..."
                  className="w-full border border-border rounded-[8px] px-3 py-1.5 text-sm font-dm-sans bg-background focus:outline-none focus:ring-1 focus:ring-btn-bg"
                />
                {tagSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-background border border-border rounded-[8px] shadow-sm z-10 max-h-48 overflow-y-auto">
                    {tagSuggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => addTag(s)}
                        className="block w-full text-left px-3 py-1.5 text-sm font-dm-sans hover:bg-surface text-text-primary"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {contentChangedSinceTagRefresh && (
                <div className="text-xs text-text-dimmed font-dm-sans mt-2">
                  Content has changed.{" "}
                  <button onClick={refreshSkillTags} className="text-text-primary underline hover:no-underline">
                    Update skill tags
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — chat */}
          <div className="flex-[2] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-syne font-semibold text-sm text-text-primary">Career Coach</h2>
                  <p className="text-text-dimmed text-xs font-dm-sans">Ask me about your anecdote</p>
                </div>
                <div className="text-xs text-text-dimmed font-dm-sans">
                  Coaching: <span className="text-text-primary capitalize">{currentSection}</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {anecdote.conversation_history.length === 0 && !chatLoading && (
                <div className="bg-surface border border-border rounded-[8px] p-3 text-sm font-dm-sans text-text-primary">
                  Hi! I&apos;m your career coach. Once you&apos;re ready, I&apos;ll help you build out your STAR anecdote. Start typing below, or describe your experience in your own words.
                </div>
              )}

              {anecdote.conversation_history.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div className={m.role === "user"
                    ? "bg-btn-bg text-btn-text rounded-[8px] px-3 py-2 text-sm font-dm-sans max-w-[80%]"
                    : "bg-surface border border-border rounded-[8px] px-3 py-2 text-sm font-dm-sans text-text-primary max-w-[80%]"}>
                    {m.content}
                    <div className={`text-xs mt-1 ${m.role === "user" ? "text-btn-text/60" : "text-text-dimmed"}`}>
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}

              {pendingSummary && (
                <div className="bg-surface-secondary border border-border rounded-[8px] p-3">
                  <div className="font-syne font-semibold text-xs text-text-primary mb-2 capitalize">
                    Suggested bullets for {pendingSummary.section}:
                  </div>
                  <ul className="text-sm font-dm-sans text-text-primary space-y-1 list-disc pl-4 mb-3">
                    {pendingSummary.bullets.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                  <button
                    onClick={applySummaryToForm}
                    className="bg-btn-bg text-btn-text text-xs px-3 py-1.5 rounded-[8px] font-dm-sans"
                  >
                    Apply to form
                  </button>
                </div>
              )}

              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-surface border border-border rounded-[8px] px-3 py-2 text-sm font-dm-sans text-text-dimmed animate-pulse">
                    ●●●
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.shiftKey) {
                      e.preventDefault();
                      handleChatSubmit();
                    }
                  }}
                  disabled={chatLoading}
                  rows={3}
                  placeholder="Type your reply..."
                  className="flex-1 border border-border rounded-[8px] px-3 py-2 text-sm font-dm-sans bg-background resize-none focus:outline-none focus:ring-1 focus:ring-btn-bg disabled:opacity-50"
                />
                <button
                  onClick={handleChatSubmit}
                  disabled={chatLoading || !chatInput.trim()}
                  className="bg-btn-bg text-btn-text text-sm px-4 py-2 rounded-[8px] font-dm-sans self-end disabled:opacity-40"
                >
                  Send
                </button>
              </div>
              <p className="text-xs text-text-dimmed font-dm-sans mt-1">Shift+Enter to send</p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function bulletSignature(a: Anecdote): string {
  return JSON.stringify([
    a.situation_bullets, a.task_bullets, a.action_bullets, a.result_bullets, a.long_term_implications,
  ]);
}

function SaveIndicator({ saving, savedAt }: { saving: boolean; savedAt: number | null }) {
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (!savedAt) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(t);
  }, [savedAt]);

  if (saving) return <span className="text-xs text-text-dimmed font-dm-sans">Saving…</span>;
  if (showSaved) return <span className="text-xs text-text-dimmed font-dm-sans">Saved</span>;
  return <span className="text-xs text-text-dimmed font-dm-sans">&nbsp;</span>;
}

function CollapsibleSection({
  title, open, onToggle, children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <button
        onClick={onToggle}
        className="w-full font-syne font-semibold text-base text-text-primary flex items-center justify-between cursor-pointer mb-2"
      >
        <span>{title}</span>
        <span className="text-text-dimmed text-sm">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

function BulletList({
  bullets, onChange,
}: {
  bullets: string[];
  onChange: (next: string[]) => void;
}) {
  const handleEdit = (i: number, value: string) => {
    const next = [...bullets]; next[i] = value; onChange(next);
  };
  const handleRemove = (i: number) => {
    onChange(bullets.filter((_, idx) => idx !== i));
  };
  const handleAdd = () => onChange([...bullets, ""]);

  return (
    <div className="space-y-1">
      {bullets.map((b, i) => (
        <div key={i} className="flex items-center gap-2 group">
          <span className="text-text-dimmed text-sm">•</span>
          <input
            value={b}
            onChange={(e) => handleEdit(i, e.target.value)}
            className="flex-1 border-b border-border bg-transparent text-sm font-dm-sans text-text-primary py-1.5 focus:outline-none focus:border-btn-bg transition-all duration-[150ms]"
          />
          <button
            onClick={() => handleRemove(i)}
            className="text-text-dimmed hover:text-text-primary text-sm opacity-0 group-hover:opacity-100 transition-all duration-[150ms]"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={handleAdd}
        className="text-xs text-text-dimmed hover:text-text-primary font-dm-sans mt-1"
      >
        + Add bullet
      </button>
    </div>
  );
}
