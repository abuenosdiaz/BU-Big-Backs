"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dishes" },
  { to: "/near-me", label: "Near me" },
  { to: "/forums", label: "Forums" },
  { to: "/feedback", label: "Feedback" },
] as const;

function isActive(path: string, to: string) {
  return to === "/" ? path === "/" : path === to || path.startsWith(`${to}/`);
}

export function SiteHeader() {
  // On dynamic routes (/dish/[id]) the path is only known at request time, so
  // the header prerenders with no active link and fills in once it streams.
  return (
    <Suspense fallback={<Header path="" />}>
      <CurrentHeader />
    </Suspense>
  );
}

function CurrentHeader() {
  return <Header path={usePathname()} />;
}

function Header({ path }: { path: string }) {
  const onProfile = isActive(path, "/profile");
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3 md:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="BU Big Backs home">
          <Image src="/logo.png" alt="" width={806} height={727} priority className="h-14 w-auto" />
          <span className="font-display text-2xl font-black leading-none tracking-tight text-foreground">Big Backs</span>
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-1">
          {NAV.map((n) => {
            const active = isActive(path, n.to);
            return (
              <Link
                key={n.to}
                href={n.to}
                className={cn("nav-link", active && "nav-link-active")}
                aria-current={active ? "page" : undefined}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/profile"
          aria-label="My profile"
          className={cn(
            "grid h-11 w-11 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-border",
            onProfile && "!bg-foreground !text-background",
          )}
        >
          <UserRound className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 pb-20 pt-10 md:px-8">{children}</main>
    </div>
  );
}
