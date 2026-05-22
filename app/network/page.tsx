"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Spinner, PageSpinner } from "@/components/Spinner";
import { createBrowserSupabase } from "@/lib/supabase";
import type { NetworkContact } from "@/lib/types";

const SOURCES = ["LinkedIn", "Referral", "Event", "Cold Outreach", "Class", "Alumni Network", "Other"];

type SortKey = "last_interaction" | "name" | "company";

type FormState = {
  name: string;
  company: string;
  email: string;
  phone: string;
  connection_source: string;
  last_interaction: string;
  discussion_notes: string;
};

const EMPTY_FORM: FormState = {
  name: "", company: "", email: "", phone: "",
  connection_source: "", last_interaction: "", discussion_notes: "",
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function NetworkPage() {
  const [contacts, setContacts] = useState<NetworkContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("last_interaction");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<NetworkContact | null>(null);

  const supabase = useMemo(() => createBrowserSupabase(), []);

  const fetchContacts = useCallback(async (t: string) => {
    const res = await fetch("/api/network", { headers: { "x-access-token": t } });
    const data = await res.json() as { contacts?: NetworkContact[]; error?: string };
    if (res.ok) setContacts(data.contacts ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const t = data.session?.access_token ?? null;
      setToken(t);
      if (t) await fetchContacts(t);
      setLoading(false);
    })();
  }, [supabase, fetchContacts]);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? contacts.filter((c) =>
          c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q))
      : contacts;
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "company") return a.company.localeCompare(b.company);
      // last_interaction desc, nulls last
      const av = a.last_interaction ? new Date(a.last_interaction).getTime() : -Infinity;
      const bv = b.last_interaction ? new Date(b.last_interaction).getTime() : -Infinity;
      return bv - av;
    });
    return sorted;
  }, [contacts, search, sortKey]);

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (c: NetworkContact) => { setEditing(c); setModalOpen(true); };

  const handleSaved = (saved: NetworkContact) => {
    setContacts((cs) => {
      const idx = cs.findIndex((c) => c.id === saved.id);
      if (idx === -1) return [saved, ...cs];
      const next = [...cs]; next[idx] = saved; return next;
    });
    setModalOpen(false);
  };

  const handleDeleted = (id: string) => {
    setContacts((cs) => cs.filter((c) => c.id !== id));
    setModalOpen(false);
  };

  return (
    <>
      <Sidebar />
      <main className="ml-56 min-h-screen bg-background">
        <div className="max-w-6xl mx-auto p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="font-syne font-bold text-2xl text-text-primary">Network Bank</h1>
              <p className="font-dm-sans text-sm text-text-dimmed mt-1">Track your professional contacts and conversations.</p>
            </div>
            <button
              onClick={openAdd}
              className="bg-btn-bg text-btn-text text-sm px-4 py-2 rounded-[8px] font-dm-sans hover:opacity-90 transition-all duration-[150ms]"
            >
              Add Contact
            </button>
          </div>

          {loading ? (
            <PageSpinner label="Loading contacts..." />
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or company..."
                  className="border border-border rounded-[8px] px-3 py-2 text-sm font-dm-sans bg-background w-80 focus:outline-none focus:border-text-primary transition-all duration-[150ms]"
                />
                <div className="flex items-center gap-2 ml-auto">
                  {(["last_interaction", "name", "company"] as SortKey[]).map((k) => {
                    const active = sortKey === k;
                    const labels: Record<SortKey, string> = {
                      last_interaction: "Last Interaction",
                      name: "Name",
                      company: "Company",
                    };
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

              {filteredSorted.length === 0 ? (
                <div className="border border-border rounded-[8px] bg-surface py-16 text-center">
                  <p className="text-text-dimmed font-dm-sans text-sm">
                    {contacts.length === 0
                      ? "No contacts yet. Click \"Add Contact\" to get started."
                      : "No contacts match your search."}
                  </p>
                </div>
              ) : (
                <div className="border border-border rounded-[8px] overflow-hidden">
                  <table className="w-full font-dm-sans text-sm">
                    <thead>
                      <tr className="bg-surface border-b border-border text-text-dimmed text-xs uppercase tracking-wide">
                        <th className="text-left px-4 py-2.5">Name</th>
                        <th className="text-left px-4 py-2.5">Company</th>
                        <th className="text-left px-4 py-2.5">Last Interaction</th>
                        <th className="text-left px-4 py-2.5">Connection Source</th>
                        <th className="text-right px-4 py-2.5">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSorted.map((c, i) => (
                        <tr
                          key={c.id}
                          className={`${i % 2 === 0 ? "bg-background" : "bg-surface"} border-b border-border last:border-b-0`}
                        >
                          <td className="px-4 py-3 text-text-primary">{c.name}</td>
                          <td className="px-4 py-3 text-text-primary">{c.company}</td>
                          <td className="px-4 py-3 text-text-dimmed">{formatDate(c.last_interaction)}</td>
                          <td className="px-4 py-3 text-text-dimmed">{c.connection_source || "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => openEdit(c)}
                              className="text-text-dimmed hover:text-text-primary text-xs transition-all duration-[150ms]"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {modalOpen && token && (
        <ContactModal
          token={token}
          initial={editing}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}

function ContactModal({
  token, initial, onClose, onSaved, onDeleted,
}: {
  token: string;
  initial: NetworkContact | null;
  onClose: () => void;
  onSaved: (c: NetworkContact) => void;
  onDeleted: (id: string) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initial ? {
    name: initial.name,
    company: initial.company,
    email: initial.email,
    phone: initial.phone,
    connection_source: initial.connection_source,
    last_interaction: initial.last_interaction ?? "",
    discussion_notes: initial.discussion_notes,
  } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof FormState>(key: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    if (!form.name.trim() || !form.company.trim()) {
      setError("Name and company are required.");
      return;
    }
    setSaving(true); setError("");
    try {
      const url = initial ? `/api/network/${initial.id}` : "/api/network";
      const method = initial ? "PATCH" : "POST";
      const payload = { ...form, last_interaction: form.last_interaction || null };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "x-access-token": token },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { contact?: NetworkContact; error?: string };
      if (!res.ok || !data.contact) throw new Error(data.error ?? "Failed to save");
      onSaved(data.contact);
    } catch (err) {
      setError((err as { message?: string }).message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!initial) return;
    if (!window.confirm("Delete this contact?")) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/network/${initial.id}`, {
        method: "DELETE",
        headers: { "x-access-token": token },
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Failed to delete");
      }
      onDeleted(initial.id);
    } catch (err) {
      setError((err as { message?: string }).message ?? "Failed to delete");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-[8px] w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-syne font-bold text-lg text-text-primary">
              {initial ? "Edit Contact" : "Add Contact"}
            </h2>
            <button onClick={onClose} className="text-text-dimmed hover:text-text-primary text-xl leading-none">×</button>
          </div>

          <div className="space-y-4">
            <Field label="Full Name *">
              <input type="text" value={form.name} onChange={set("name")} className={inputCls} />
            </Field>
            <Field label="Company *">
              <input type="text" value={form.company} onChange={set("company")} className={inputCls} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={set("email")} className={inputCls} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={form.phone} onChange={set("phone")} className={inputCls} />
            </Field>
            <Field label="Connection Source">
              <select value={form.connection_source} onChange={set("connection_source")} className={inputCls}>
                <option value="">—</option>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Last Interaction Date">
              <input type="date" value={form.last_interaction} onChange={set("last_interaction")} className={inputCls} />
            </Field>
            <Field label="Discussion Notes">
              <textarea
                value={form.discussion_notes}
                onChange={set("discussion_notes")}
                rows={5}
                placeholder="What did you discuss? Any insights about the company, role, or team? Any follow-ups promised?"
                className={`${inputCls} resize-none`}
              />
            </Field>
          </div>

          {error && <p className="text-xs text-red-500 font-dm-sans mt-3">{error}</p>}

          <div className="flex items-center justify-between mt-6">
            <div>
              {initial && (
                <button
                  onClick={remove}
                  disabled={saving}
                  className="text-xs text-red-600 hover:text-red-700 font-dm-sans transition-all duration-[150ms]"
                >
                  Delete contact
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="text-text-dimmed hover:text-text-primary text-sm font-dm-sans px-3 py-2 transition-all duration-[150ms]"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="bg-btn-bg text-btn-text text-sm px-4 py-2 rounded-[8px] font-dm-sans hover:opacity-90 transition-all duration-[150ms] disabled:opacity-40 flex items-center gap-2"
              >
                {saving && <Spinner size="sm" />}
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full border border-border rounded-[8px] px-3 py-2 text-sm font-dm-sans bg-background focus:outline-none focus:ring-1 focus:ring-btn-bg transition-all duration-[150ms]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-dm-sans text-text-dimmed mb-1">{label}</label>
      {children}
    </div>
  );
}
