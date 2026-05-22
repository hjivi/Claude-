"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Spinner, PageSpinner } from "@/components/Spinner";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Anecdote } from "@/lib/types";

type StatusFilter = "all" | "in_process" | "approved";
type SortKey = "recent" | "company" | "status";

type ParsedPreview = Pick<Anecdote, "id" | "company" | "job_title" | "date_range" | "situation_bullets">;

export default function AnecdotesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [anecdotes, setAnecdotes] = useState<Anecdote[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");

  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<ParsedPreview[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (t: string) => {
    const res = await fetch("/api/anecdotes", { headers: { "x-access-token": t } });
    const data = await res.json() as { anecdotes?: Anecdote[] };
    if (res.ok) setAnecdotes(data.anecdotes ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const t = data.session?.access_token ?? null;
      setToken(t);
      if (t) await refresh(t);
      setLoading(false);
    })();
  }, [supabase, refresh]);

  const companies = useMemo(
    () => Array.from(new Set(anecdotes.map((a) => a.company).filter(Boolean))).sort(),
    [anecdotes]
  );
  const allTags = useMemo(
    () => Array.from(new Set(anecdotes.flatMap((a) => a.skill_tags))).sort(),
    [anecdotes]
  );

  const approvedCount = useMemo(() => anecdotes.filter((a) => a.status === "approved").length, [anecdotes]);
  const inProcessCount = anecdotes.length - approvedCount;

  const filtered = useMemo(() => {
    let list = anecdotes;
    if (statusFilter !== "all") list = list.filter((a) => a.status === statusFilter);
    if (companyFilter) list = list.filter((a) => a.company === companyFilter);
    if (tagFilter) list = list.filter((a) => a.skill_tags.includes(tagFilter));
    const sorted = [...list].sort((a, b) => {
      if (sortKey === "company") return a.company.localeCompare(b.company);
      if (sortKey === "status") return a.status.localeCompare(b.status);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return sorted;
  }, [anecdotes, statusFilter, companyFilter, tagFilter, sortKey]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    e.target.value = "";
    setImporting(true); setImported([]);
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch("/api/anecdotes/parse-cv", {
        method: "POST",
        headers: { "Content-Type": "application/pdf", "x-access-token": token },
        body: buf,
      });
      const data = await res.json() as { anecdotes?: ParsedPreview[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to parse CV");
      setImported(data.anecdotes ?? []);
      setImportOpen(true);
      await refresh(token);
    } catch (err) {
      alert((err as { message?: string }).message ?? "Failed to parse CV");
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Sidebar />
      <main className="ml-56 min-h-screen bg-background">
        <div className="max-w-6xl mx-auto p-8">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h1 className="font-syne font-bold text-2xl text-text-primary">Anecdote Bank</h1>
              <p className="font-dm-sans text-sm text-text-dimmed mt-1">Build and manage your STAR anecdotes.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleUploadClick}
                className="border border-border text-text-dimmed hover:text-text-primary text-sm px-4 py-2 rounded-[8px] font-dm-sans transition-all duration-[150ms]"
              >
                Upload CV
              </button>
              <button
                onClick={() => setNewOpen(true)}
                className="bg-btn-bg text-btn-text text-sm px-4 py-2 rounded-[8px] font-dm-sans hover:opacity-90 transition-all duration-[150ms]"
              >
                New Anecdote
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {loading ? (
            <PageSpinner label="Loading anecdotes..." />
          ) : (
            <>
              <div className="font-dm-sans text-sm text-text-dimmed mb-3">
                {approvedCount} approved | {inProcessCount} in process
              </div>

              {approvedCount < 15 && (
                <div className="bg-surface border border-border rounded-[8px] p-3 font-dm-sans text-sm text-text-primary mb-4">
                  We recommend at least 15 approved anecdotes for best results. You have {approvedCount} approved.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mb-5">
                {(["all", "in_process", "approved"] as StatusFilter[]).map((s) => {
                  const labels: Record<StatusFilter, string> = { all: "All", in_process: "In Process", approved: "Approved" };
                  const active = statusFilter === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`text-xs rounded-[8px] px-3 py-1.5 font-dm-sans transition-all duration-[150ms] ${
                        active ? "bg-btn-bg text-btn-text" : "border border-border text-text-dimmed hover:text-text-primary"
                      }`}
                    >
                      {labels[s]}
                    </button>
                  );
                })}

                <select
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  className="border border-border rounded-[8px] px-3 py-1.5 text-xs font-dm-sans bg-background"
                >
                  <option value="">All companies</option>
                  {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>

                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className="border border-border rounded-[8px] px-3 py-1.5 text-xs font-dm-sans bg-background"
                >
                  <option value="">All skills</option>
                  {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>

                <div className="ml-auto flex gap-2">
                  {(["recent", "company", "status"] as SortKey[]).map((k) => {
                    const labels: Record<SortKey, string> = { recent: "Most Recent", company: "Company", status: "Status" };
                    const active = sortKey === k;
                    return (
                      <button
                        key={k}
                        onClick={() => setSortKey(k)}
                        className={`text-xs rounded-[8px] px-3 py-1.5 font-dm-sans transition-all duration-[150ms] ${
                          active ? "bg-btn-bg text-btn-text" : "border border-border text-text-dimmed hover:text-text-primary"
                        }`}
                      >
                        {labels[k]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {anecdotes.length === 0 ? (
                <div className="border border-border rounded-[8px] bg-surface py-20 text-center">
                  <p className="text-text-primary font-dm-sans text-sm mb-3">
                    No anecdotes yet. Upload your CV to get started, or create one manually.
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={handleUploadClick}
                      className="border border-border text-text-dimmed hover:text-text-primary text-sm px-4 py-2 rounded-[8px] font-dm-sans"
                    >
                      Upload CV
                    </button>
                    <button
                      onClick={() => setNewOpen(true)}
                      className="bg-btn-bg text-btn-text text-sm px-4 py-2 rounded-[8px] font-dm-sans"
                    >
                      New Anecdote
                    </button>
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="border border-border rounded-[8px] bg-surface py-16 text-center">
                  <p className="text-text-dimmed font-dm-sans text-sm">No anecdotes match your filters.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filtered.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => router.push(`/anecdotes/${a.id}`)}
                      className="text-left border border-border rounded-[8px] p-4 bg-surface hover:bg-surface-secondary transition-all duration-[150ms]"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="font-syne font-bold text-sm text-text-primary truncate">
                            {a.company || "Untitled"}
                          </div>
                          {a.date_range && (
                            <div className="text-text-dimmed text-xs font-dm-sans">{a.date_range}</div>
                          )}
                        </div>
                        <StatusBadge status={a.status} />
                      </div>
                      {a.job_title && (
                        <div className="font-dm-sans text-sm text-text-primary">{a.job_title}</div>
                      )}
                      {a.situation_bullets[0] ? (
                        <div className="text-text-dimmed text-xs font-dm-sans mt-1 line-clamp-2">
                          {a.situation_bullets[0].slice(0, 100)}{a.situation_bullets[0].length > 100 ? "…" : ""}
                        </div>
                      ) : (
                        <div className="text-text-dimmed text-xs italic font-dm-sans mt-1">
                          No content yet — click to start
                        </div>
                      )}
                      {a.skill_tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {a.skill_tags.slice(0, 5).map((t) => (
                            <span key={t} className="bg-surface-secondary text-text-dimmed text-xs px-2 py-0.5 rounded-[8px]">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {newOpen && token && (
        <NewAnecdoteModal
          token={token}
          onClose={() => setNewOpen(false)}
          onCreated={(a) => { setNewOpen(false); router.push(`/anecdotes/${a.id}`); }}
        />
      )}

      {importing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex flex-col items-center justify-center">
          <PageSpinner label="Parsing your CV..." />
        </div>
      )}

      {importOpen && (
        <ImportPreviewModal
          imported={imported}
          onClose={() => setImportOpen(false)}
        />
      )}
    </>
  );
}

function StatusBadge({ status }: { status: "approved" | "in_process" }) {
  if (status === "approved") {
    return (
      <span className="bg-green-50 text-green-700 border border-green-200 text-xs px-2 py-0.5 rounded-[8px] font-dm-sans shrink-0">
        Approved
      </span>
    );
  }
  return (
    <span className="bg-yellow-50 text-yellow-700 border border-yellow-200 text-xs px-2 py-0.5 rounded-[8px] font-dm-sans shrink-0">
      In Process
    </span>
  );
}

function NewAnecdoteModal({
  token, onClose, onCreated,
}: {
  token: string;
  onClose: () => void;
  onCreated: (a: Anecdote) => void;
}) {
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!company.trim() || !jobTitle.trim()) {
      setError("Company and job title are required.");
      return;
    }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/anecdotes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-token": token },
        body: JSON.stringify({ company, job_title: jobTitle, date_range: dateRange }),
      });
      const data = await res.json() as { anecdote?: Anecdote; error?: string };
      if (!res.ok || !data.anecdote) throw new Error(data.error ?? "Failed to create");
      onCreated(data.anecdote);
    } catch (err) {
      setError((err as { message?: string }).message ?? "Failed to create");
      setSaving(false);
    }
  };

  const cls = "w-full border border-border rounded-[8px] px-3 py-2 text-sm font-dm-sans bg-background focus:outline-none focus:ring-1 focus:ring-btn-bg";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-[8px] w-full max-w-md">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-syne font-bold text-lg text-text-primary">New Anecdote</h2>
            <button onClick={onClose} className="text-text-dimmed hover:text-text-primary text-xl leading-none">×</button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-dm-sans text-text-dimmed mb-1">Company *</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} className={cls} placeholder="Stripe" />
            </div>
            <div>
              <label className="block text-xs font-dm-sans text-text-dimmed mb-1">Job Title *</label>
              <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={cls} placeholder="Senior Product Manager" />
            </div>
            <div>
              <label className="block text-xs font-dm-sans text-text-dimmed mb-1">Date Range</label>
              <input value={dateRange} onChange={(e) => setDateRange(e.target.value)} className={cls} placeholder="Jan 2023 – Jun 2024" />
            </div>
          </div>
          {error && <p className="text-xs text-red-500 font-dm-sans mt-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={onClose} className="text-text-dimmed hover:text-text-primary text-sm font-dm-sans px-3 py-2">Cancel</button>
            <button
              onClick={submit}
              disabled={saving}
              className="bg-btn-bg text-btn-text text-sm px-4 py-2 rounded-[8px] font-dm-sans disabled:opacity-40 flex items-center gap-2"
            >
              {saving && <Spinner size="sm" />}
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportPreviewModal({
  imported, onClose,
}: {
  imported: ParsedPreview[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-[8px] w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="font-syne font-bold text-lg text-text-primary">
              CV Parsed — {imported.length} anecdote{imported.length === 1 ? "" : "s"} found
            </h2>
            <button onClick={onClose} className="text-text-dimmed hover:text-text-primary text-xl leading-none">×</button>
          </div>
          <p className="text-xs text-text-dimmed font-dm-sans mt-1">
            All imported as &ldquo;in process&rdquo;. Open each to review, edit, and approve.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {imported.map((a) => (
            <div key={a.id} className="border border-border rounded-[8px] p-3 bg-surface">
              <div className="font-syne font-bold text-sm text-text-primary">{a.company || "Untitled"}</div>
              {a.job_title && <div className="font-dm-sans text-sm text-text-primary">{a.job_title}</div>}
              {a.date_range && <div className="text-xs text-text-dimmed font-dm-sans">{a.date_range}</div>}
              {a.situation_bullets[0] && (
                <div className="text-xs text-text-dimmed font-dm-sans mt-1 line-clamp-2">{a.situation_bullets[0]}</div>
              )}
            </div>
          ))}
        </div>
        <div className="p-6 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="bg-btn-bg text-btn-text text-sm px-4 py-2 rounded-[8px] font-dm-sans">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
