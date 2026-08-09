"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  RefreshCw, Settings, Bookmark, BarChart2,
  Newspaper, Building2, LogIn, LogOut, Headphones,
  GitMerge, Layers, Network, UserCircle, Eye, SlidersHorizontal, Star,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { resolveSession, type SessionInfo } from "@/lib/marketSession";

const NAV_LINKS = [
  { href: "/feed",            label: "Feed",       icon: Newspaper  },
  { href: "/markets",         label: "Markets",    icon: BarChart2  },
  { href: "/industries",      label: "Industries", icon: Building2  },
  { href: "/ma",              label: "M&A",        icon: GitMerge   },
  { href: "/private-markets", label: "Private",    icon: Layers     },
  { href: "/listen",          label: "Listen",     icon: Headphones },
  { href: "/saved",           label: "Saved",      icon: Bookmark   },
] as const;

interface TopNavProps {
  onRefresh?:           () => void;
  onOpenSettings?:      () => void;
  onOpenThemeTerminal?: () => void;
  isRefreshing?:        boolean;
}

export function TopNav({ onRefresh, onOpenSettings, onOpenThemeTerminal, isRefreshing }: TopNavProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const { user, signOut, loading: authLoading } = useAuth();
  const { initials, fullName, memberSince, loading: profileLoading } = useProfile();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Real US-market session state (client-computed to avoid an SSR/ET-time mismatch). The status
  // indicator reflects it truthfully — "Live" + pulse only during the regular trading session,
  // and the honest daypart (Pre-market / After hours / Weekend / Holiday) otherwise.
  const [session, setSession] = useState<SessionInfo | null>(null);
  useEffect(() => {
    const tick = () => setSession(resolveSession(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  const loading = authLoading || profileLoading;

  return (
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-50 nav-height backdrop-blur-md border-b",
        "transition-all duration-300",
        scrolled ? "shadow-nav" : "shadow-none",
      )}
      style={{
        background: "rgba(5,8,18,0.90)",
        borderBottomColor: "rgba(255,255,255,0.055)",
      }}
    >
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center gap-5">

        {/* ── Logo ──────────────────────────────────────────────────────── */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 link-reset group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/argus-icon.png"
            alt="Argus"
            className="transition-transform duration-200 group-hover:scale-105"
            style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0 }}
          />
          <span className="font-medium text-[13px] tracking-tight hidden sm:block"
            style={{ color: "rgba(255,255,255,0.72)", letterSpacing: "-0.01em" }}>
            Argus
          </span>
        </Link>

        {/* ── Market-session indicator (truthful: pulses "Live" only while the market is open) ── */}
        {session && (
          <div className="flex items-center gap-1.5 shrink-0" title={session.statusLine}>
            <span className="relative flex h-1.5 w-1.5">
              {session.live && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-55"
                  style={{ background: "#52b0c8" }} />
              )}
              <span className="relative inline-flex rounded-full h-1.5 w-1.5"
                style={{ background: session.live ? "#3a98b0" : "#5b6b7a" }} />
            </span>
            <span className="text-2xs font-medium hidden sm:inline"
              style={{ color: session.live ? "#4898a8" : "rgba(255,255,255,0.42)" }}>
              {session.live ? "Live" : session.label}
            </span>
          </div>
        )}

        {/* ── Nav links ─────────────────────────────────────────────────── */}
        <nav className="flex items-center gap-0.5 flex-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/[0.05]"
                style={{ color: active ? "rgba(82,176,200,0.88)" : "rgba(255,255,255,0.42)" }}
              >
                <Icon size={13} strokeWidth={2} />
                <span className="hidden sm:inline">{label}</span>
                {active && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-lg -z-10"
                    style={{ background: "rgba(82,176,200,0.07)" }}
                    transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* ── Right actions ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 shrink-0">
          {onRefresh && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={onRefresh}
              disabled={isRefreshing}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
                "hover:bg-white/[0.05] transition-colors",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
              style={{ color: "rgba(255,255,255,0.42)" }}
              title="Refresh feed"
            >
              <motion.div
                animate={isRefreshing ? { rotate: 360 } : {}}
                transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
              >
                <RefreshCw size={13} />
              </motion.div>
              <span className="hidden sm:inline">
                {isRefreshing ? "Refreshing…" : "Refresh"}
              </span>
            </motion.button>
          )}

          {onOpenThemeTerminal && (
            <button
              onClick={onOpenThemeTerminal}
              className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors"
              style={{ color: "rgba(255,255,255,0.36)" }}
              title="Theme Intelligence Terminal"
            >
              <Network size={14} />
            </button>
          )}

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors"
              style={{ color: "rgba(255,255,255,0.36)" }}
              title="Settings"
            >
              <Settings size={15} />
            </button>
          )}

          {/* ── Auth area ───────────────────────────────────────────────── */}
          {!loading && (
            user ? (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      "text-[10.5px] font-bold shrink-0 tracking-wide",
                      "hover:opacity-90 active:scale-95 transition-all duration-150",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                    )}
                    style={{
                      background: "linear-gradient(145deg, #152550 0%, #1a3a72 100%)",
                      color: "rgba(255,255,255,0.82)",
                      boxShadow: "0 1px 6px rgba(26,58,114,0.45)",
                    }}
                    aria-label="Account menu"
                  >
                    {initials}
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={10}
                    className={cn(
                      "z-50 min-w-[220px] rounded-xl overflow-hidden",
                      "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
                      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
                      "origin-top-right",
                    )}
                    style={{
                      background:     "rgba(8,12,26,0.98)",
                      border:         "1px solid rgba(255,255,255,0.08)",
                      backdropFilter: "blur(20px)",
                      boxShadow:      "0 20px 60px rgba(0,0,0,0.65), 0 0 0 0.5px rgba(255,255,255,0.04) inset",
                    }}
                  >
                    {/* Top accent */}
                    <div style={{ height: "1.5px", background: "linear-gradient(to right, transparent, rgba(83,150,220,0.35), transparent)" }} />

                    {/* ── Identity block ──────────────────────────────────── */}
                    <div className="px-4 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold tracking-wide"
                          style={{
                            background: "linear-gradient(145deg, #152550 0%, #1a3a72 100%)",
                            color: "rgba(255,255,255,0.78)",
                            boxShadow: "0 2px 8px rgba(26,58,114,0.40)",
                          }}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0">
                          {fullName && fullName !== "there" && (
                            <p className="text-[12.5px] font-medium truncate"
                              style={{ color: "rgba(255,255,255,0.72)", letterSpacing: "-0.01em" }}>
                              {fullName}
                            </p>
                          )}
                          <p className="text-[11px] truncate"
                            style={{ color: "rgba(255,255,255,0.32)" }}>
                            {user.email}
                          </p>
                          {memberSince && (
                            <p className="text-[9.5px] mt-0.5"
                              style={{ color: "rgba(255,255,255,0.20)", letterSpacing: "0.04em" }}>
                              Member since {memberSince}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Menu items ──────────────────────────────────────── */}
                    <div className="p-1.5">

                      <DropdownMenu.Item asChild>
                        <Link href="/settings" className={menuItemClass} style={{ color: "rgba(255,255,255,0.68)" }}>
                          <UserCircle size={12} style={menuIconStyle} />
                          My Profile
                        </Link>
                      </DropdownMenu.Item>

                      <DropdownMenu.Item asChild>
                        <Link href="/settings" className={menuItemClass} style={{ color: "rgba(255,255,255,0.68)" }}>
                          <SlidersHorizontal size={12} style={menuIconStyle} />
                          Intelligence Preferences
                        </Link>
                      </DropdownMenu.Item>

                      <DropdownMenu.Separator style={{ height: 1, background: "rgba(255,255,255,0.045)", margin: "2px 0" }} />

                      <DropdownMenu.Item asChild>
                        <Link href="/saved" className={menuItemClass} style={{ color: "rgba(255,255,255,0.68)" }}>
                          <Bookmark size={12} style={menuIconStyle} />
                          Saved Intelligence
                        </Link>
                      </DropdownMenu.Item>

                      <DropdownMenu.Item asChild>
                        <Link href="/saved" className={menuItemClass} style={{ color: "rgba(255,255,255,0.68)" }}>
                          <Star size={12} style={menuIconStyle} />
                          Watchlist
                        </Link>
                      </DropdownMenu.Item>

                      <DropdownMenu.Item asChild>
                        <Link href="/feed" className={menuItemClass} style={{ color: "rgba(255,255,255,0.68)" }}>
                          <Eye size={12} style={menuIconStyle} />
                          Intelligence Feed
                        </Link>
                      </DropdownMenu.Item>

                    </div>

                    <DropdownMenu.Separator
                      style={{ height: 1, background: "rgba(255,255,255,0.055)", margin: "0 0 4px" }} />

                    <div className="p-1.5">
                      <DropdownMenu.Item
                        onSelect={handleSignOut}
                        className={cn(menuItemClass, "hover:bg-red-500/10 data-[highlighted]:bg-red-500/10")}
                        style={{ color: "rgba(220,80,80,0.80)" }}
                      >
                        <LogOut size={12} style={{ color: "rgba(220,80,80,0.55)", flexShrink: 0 }} />
                        Sign Out
                      </DropdownMenu.Item>
                    </div>

                    <div style={{ height: "2px" }} />

                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            ) : (
              <Link
                href="/auth"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white/[0.05] transition-colors"
                style={{ color: "rgba(255,255,255,0.42)" }}
              >
                <LogIn size={13} />
                <span className="hidden sm:inline">Sign in</span>
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}

// ── Menu primitives ──────────────────────────────────────────────────────────

const menuItemClass =
  "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[12px] outline-none cursor-pointer select-none transition-colors hover:bg-white/[0.05] data-[highlighted]:bg-white/[0.05]";

const menuIconStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.28)",
  flexShrink: 0,
};
