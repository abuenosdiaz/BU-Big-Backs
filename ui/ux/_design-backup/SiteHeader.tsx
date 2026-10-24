import { Link } from "@tanstack/react-router";
import logo from "@/assets/logo.png";

const NAV = [
  { to: "/", label: "Dishes" },
  { to: "/near-me", label: "Near me" },
  { to: "/forums", label: "Forums" },
  { to: "/feedback", label: "Feedback" },
  { to: "/profile", label: "Profile" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5">
        <Link to="/" className="flex shrink-0 items-center" aria-label="BU Big Backs home">
          <img src={logo} alt="BU Big Backs — dog mascot munching a burger" className="h-16 w-auto" />
        </Link>
        <nav className="flex gap-1 overflow-x-auto text-sm font-medium">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="nav-link"
              activeOptions={{ exact: n.to === "/" }}
              activeProps={{ className: "nav-link-active" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-8">{children}</main>
    </div>
  );
}
