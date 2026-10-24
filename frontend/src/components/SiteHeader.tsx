import { Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import logo from "@/assets/logo.png";

const NAV = [
  { to: "/", label: "Dishes" },
  { to: "/near-me", label: "Near me" },
  { to: "/forums", label: "Forums" },
  { to: "/feedback", label: "Feedback" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3 md:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-3" aria-label="BU Big Backs home">
          <img src={logo} alt="" className="h-14 w-auto" />
          <span className="font-display text-2xl font-black leading-none tracking-tight text-foreground">Big Backs</span>
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="nav-link"
              activeOptions={{ exact: n.to === "/" }}
              activeProps={{ className: "nav-link-active", "aria-current": "page" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <Link
          to="/profile"
          aria-label="My profile"
          className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-border"
          activeProps={{ className: "!bg-foreground !text-background" }}
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
