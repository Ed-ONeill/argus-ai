"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  RefreshCw, Settings, Bookmark, BarChart2,
  Newspaper, Building2, LogIn, LogOut, User, Headphones,
  GitMerge, Layers, Network,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

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
  const { user, signOut, loading } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  // Initials for the avatar circle
  const initials = user?.email?.[0]?.toUpperCase() ?? "U";

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

        {/* ── Live indicator ────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-55"
              style={{ background: "#52b0c8" }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5"
              style={{ background: "#3a98b0" }} />
          </span>
          <span className="text-2xs font-medium hidden sm:inline" style={{ color: "#4898a8" }}>Live</span>
        </div>

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
              /* Logged-in: avatar + dropdown */
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center",
                      "text-[11px] font-bold shrink-0",
                      "hover:opacity-90 active:scale-95 transition-all duration-150",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                    )}
                    style={{
                      background: "linear-gradient(145deg, #1a3060 0%, #1e4888 100%)",
                      color: "rgba(255,255,255,0.88)",
                      boxShadow: "0 1px 6px rgba(30,72,136,0.40)",
                    }}
                    aria-label="Account menu"
                  >
                    {initials}
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={8}
                    className={cn(
                      "z-50 min-w-[200px] rounded-xl p-1",
                      "data-[state=open]:animate-in data-[state=open]:fade-in-0",
                      "data-[state=open]:zoom-in-95",
                      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
                      "data-[state=closed]:zoom-out-95",
                      "origin-top-right",
                    )}
                    style={{
                      background: "rgba(10,14,30,0.97)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      backdropFilter: "blur(16px)",
                      boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
                    }}
                  >
                    {/* User info */}
                    <div className="px-3 py-2.5 mb-1"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="flex items-center gap-2">
                        <User size={12} className="shrink-0" style={{ color: "rgba(255,255,255,0.28)" }} />
                        <p className="text-2xs font-medium truncate" style={{ color: "rgba(255,255,255,0.58)" }}>
                          {user.email}
                        </p>
                      </div>
                    </div>

                    {/* Saved items */}
                    <DropdownMenu.Item asChild>
                      <Link
                        href="/saved"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs outline-none cursor-pointer select-none hover:bg-white/[0.05] transition-colors"
                        style={{ color: "rgba(255,255,255,0.68)" }}
                      >
                        <Bookmark size={12} style={{ color: "rgba(255,255,255,0.32)" }} />
                        Saved Stories
                      </Link>
                    </DropdownMenu.Item>

                    <DropdownMenu.Separator style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                    {/* Sign out */}
                    <DropdownMenu.Item
                      onSelect={handleSignOut}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors outline-none cursor-pointer select-none hover:bg-red-500/10"
                      style={{ color: "rgba(220,80,80,0.88)" }}
                    >
                      <LogOut size={12} />
                      Sign Out
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            ) : (
              /* Logged-out: Sign in link */
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
