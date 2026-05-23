"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  RefreshCw, Settings, Bookmark, BarChart2,
  Newspaper, Building2, LogIn, LogOut, User, Headphones,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

const NAV_LINKS = [
  { href: "/",           label: "Feed",       icon: Newspaper  },
  { href: "/markets",    label: "Markets",    icon: BarChart2  },
  { href: "/industries", label: "Industries", icon: Building2  },
  { href: "/listen",     label: "Listen",     icon: Headphones },
  { href: "/saved",      label: "Saved",      icon: Bookmark   },
] as const;

interface TopNavProps {
  onRefresh?:      () => void;
  onOpenSettings?: () => void;
  isRefreshing?:   boolean;
}

export function TopNav({ onRefresh, onOpenSettings, isRefreshing }: TopNavProps) {
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
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center
                        transition-transform duration-200 group-hover:scale-105"
            style={{
              background: "linear-gradient(145deg, #1a3060 0%, #1e4888 100%)",
              boxShadow: "0 1px 8px rgba(30,72,136,0.45), inset 0 1px 0 rgba(255,255,255,0.10)",
            }}
          >
            <span className="font-bold text-[9.5px] tracking-wider" style={{ color: "rgba(255,255,255,0.92)" }}>A</span>
          </div>
          <span className="font-medium text-[13px] tracking-tight hidden sm:block"
            style={{ color: "rgba(255,255,255,0.82)", letterSpacing: "-0.01em" }}>
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
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  active
                    ? "text-accent"
                    : "text-ink-secondary hover:text-ink hover:bg-raised",
                )}
              >
                <Icon size={13} strokeWidth={2} />
                <span className="hidden sm:inline">{label}</span>
                {active && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-lg bg-accent/8 -z-10"
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
                "text-ink-secondary hover:text-ink hover:bg-raised transition-colors",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
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

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-raised transition-colors"
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
                      "z-50 min-w-[200px] bg-surface border border-edge rounded-xl",
                      "shadow-card-hover p-1",
                      "data-[state=open]:animate-in data-[state=open]:fade-in-0",
                      "data-[state=open]:zoom-in-95",
                      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
                      "data-[state=closed]:zoom-out-95",
                      "origin-top-right",
                    )}
                  >
                    {/* User info */}
                    <div className="px-3 py-2.5 border-b border-edge mb-1">
                      <div className="flex items-center gap-2">
                        <User size={12} className="text-ink-muted shrink-0" />
                        <p className="text-2xs font-medium text-ink truncate">
                          {user.email}
                        </p>
                      </div>
                    </div>

                    {/* Saved items */}
                    <DropdownMenu.Item asChild>
                      <Link
                        href="/saved"
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-ink",
                          "hover:bg-raised transition-colors outline-none cursor-pointer",
                          "select-none",
                        )}
                      >
                        <Bookmark size={12} className="text-ink-muted" />
                        Saved Stories
                      </Link>
                    </DropdownMenu.Item>

                    <DropdownMenu.Separator className="h-px bg-edge my-1" />

                    {/* Sign out */}
                    <DropdownMenu.Item
                      onSelect={handleSignOut}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-xs",
                        "text-red-600 hover:bg-red-50",
                        "transition-colors outline-none cursor-pointer select-none",
                      )}
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
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                  "text-xs font-medium text-ink-secondary",
                  "hover:text-ink hover:bg-raised transition-colors",
                )}
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
