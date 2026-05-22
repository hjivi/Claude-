"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/tracker", label: "Tracker", icon: "◎" },
  { href: "/anecdotes", label: "Anecdotes", icon: "◆" },
  { href: "/network", label: "Network", icon: "⬡" },
  { href: "/profile", label: "Profile", icon: "◈" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-56 bg-surface border-r border-border flex flex-col z-40">
      <div className="p-6 border-b border-border">
        <Link href="/dashboard">
          <span className="font-syne font-bold text-xl text-text-primary">Applyjobs</span>
        </Link>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-[8px] text-sm transition-all duration-[150ms] ${
                active
                  ? "bg-btn-bg text-btn-text font-medium"
                  : "text-text-dimmed hover:bg-surface-secondary hover:text-text-primary"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Beta badge */}
      <div className="px-4 pb-3">
        <div className="border border-border rounded-[8px] p-3 bg-background text-center">
          <p className="text-xs font-dm-sans font-medium text-text-primary">Open Beta</p>
          <p className="text-xs text-text-dimmed font-dm-sans">All features free during beta.</p>
        </div>
      </div>

      <div className="p-4 border-t border-border">
        <button
          onClick={handleSignOut}
          className="w-full text-left px-3 py-2 text-sm text-text-dimmed hover:text-text-primary transition-all duration-[150ms] rounded-[8px] hover:bg-surface-secondary"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
