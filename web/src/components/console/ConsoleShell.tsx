"use client";

import {
  BarChart3,
  ChartColumn,
  Home,
  KeyRound,
  LayoutDashboard,
  Menu,
  MonitorPlay,
  ScrollText,
  Settings2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";
import { useSession } from "@/lib/useSession";

/**
 * The console frame.
 *
 * Every signed-in page is one section of the same console, so the sections are
 * listed once here rather than being reached through links scattered across the
 * pages. Only the sections that exist are listed: a console that offers a page
 * it cannot open is worse than a short menu.
 *
 * The dashboard stands on its own at the top of the list, because it is where
 * the console opens, and the groups follow it.
 *
 * The sidebar owns the session, which is why "Sign out" lives here and nowhere
 * else - one control, on every console page, in the same place.
 */

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
}

interface NavGroup {
  title: string;
  /** Sections only an administrator may open. */
  adminOnly?: boolean;
  /** Sections that need an account behind the session, not the shared password. */
  accountsOnly?: boolean;
  items: NavItem[];
}

/** The first link of the console: the page the desk and the office open on. */
const DASHBOARD: NavItem = {
  href: "/staff/dashboard",
  label: "Dashboard",
  icon: LayoutDashboard,
};

const GROUPS: NavGroup[] = [
  {
    title: "Administration",
    adminOnly: true,
    items: [
      { href: "/admin/dashboard", label: "Team & invitations", icon: Users },
      { href: "/admin/activity", label: "Activity", icon: ScrollText },
      { href: "/admin/statistics", label: "Statistics", icon: ChartColumn },
      { href: "/admin/settings", label: "Desk settings", icon: Settings2 },
    ],
  },
  {
    title: "Analytics",
    items: [
      { href: "/staff/analytics", label: "Queue analytics", icon: BarChart3 },
    ],
  },
  {
    title: "Public pages",
    items: [
      { href: "/display", label: "Wall display", icon: MonitorPlay },
      { href: "/", label: "Home", icon: Home },
    ],
  },
  {
    // The shared classroom password has no account behind it, so there is no
    // password of its own to change.
    title: "Your account",
    accountsOnly: true,
    items: [{ href: "/account", label: "Account", icon: KeyRound }],
  },
];

export function ConsoleShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);

  const signedIn = session.status === "in" ? session.session : null;
  const isAdmin = signedIn?.user?.role === "admin";

  const close = useCallback(() => setDrawer(false), []);

  // Escape closes it, the way a panel is expected to behave.
  useEffect(() => {
    if (!drawer) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawer(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  async function signOut() {
    await api.logout();
    router.replace("/auth/login");
  }

  function renderLink(item: NavItem, onNavigate?: () => void) {
    const active = pathname === item.href;
    const Icon = item.icon;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
            active
              ? "bg-soft-mint font-semibold text-deep-green"
              : "text-medium-green hover:bg-soft-mint hover:text-deep-green"
          }`}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {item.label}
        </Link>
      </li>
    );
  }

  function renderNav(onNavigate?: () => void) {
    return (
      <nav aria-label="Console" className="flex flex-col gap-6">
        {/* The dashboard leads the console, so it stands on its own. */}
        <ul className="space-y-1">{renderLink(DASHBOARD, onNavigate)}</ul>
        {GROUPS.filter(
          (group) =>
            (!group.adminOnly || isAdmin) && (!group.accountsOnly || Boolean(signedIn?.user)),
        ).map((group) => (
          <div key={group.title}>
            <p className="px-3 text-xs font-semibold tracking-wide text-medium-green uppercase">
              {group.title}
            </p>
            <ul className="mt-2 space-y-1">
              {group.items.map((item) => renderLink(item, onNavigate))}
            </ul>
          </div>
        ))}
      </nav>
    );
  }

  function renderAccount() {
    if (!signedIn) return null;
    const name = signedIn.user?.full_name ?? signedIn.staff ?? "Signed in";
    const detail = signedIn.user ? signedIn.user.role : "shared password";
    const initials = name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
    return (
      <div className="border-t border-line pt-4">
        <Link
          href="/account"
          className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-soft-mint"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-deep-green text-sm font-semibold text-white">
            {initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-deep-green">{name}</span>
            <span className="block text-xs text-medium-green capitalize">{detail}</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-3 w-full rounded-full border border-line px-3 py-2 text-sm font-semibold text-deep-green hover:bg-soft-mint"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-soft-mint">
      {/* A phone or a tablet: the sections move into a drawer. */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white px-4 py-3 lg:hidden">
        <Link href="/" aria-label="MyTurn home">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label="Show the console menu"
          aria-expanded={drawer}
          aria-controls="console-drawer"
          className="ml-auto rounded-full border border-line p-2 text-deep-green hover:bg-soft-mint"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </header>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-deep-green/40"
            onClick={close}
            aria-hidden="true"
          />
          <div
            id="console-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Console menu"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col gap-6 overflow-y-auto border-r border-line bg-white p-5"
          >
            <div className="flex items-center">
              <Link href="/" aria-label="MyTurn home">
                <Logo />
              </Link>
              <button
                type="button"
                onClick={close}
                aria-label="Hide the console menu"
                className="ml-auto rounded-full border border-line p-2 text-deep-green hover:bg-soft-mint"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            {renderNav(close)}
            <div className="mt-auto">{renderAccount()}</div>
          </div>
        </div>
      )}

      <div className="lg:grid lg:min-h-screen lg:grid-cols-[15rem_1fr]">
        <aside className="sticky top-0 hidden h-screen flex-col gap-6 overflow-y-auto border-r border-line bg-white p-5 lg:flex [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line hover:[&::-webkit-scrollbar-thumb]:bg-medium-green [scrollbar-width:thin] [scrollbar-color:var(--color-line)_transparent]">
          <Link href="/" aria-label="MyTurn home">
            <Logo />
          </Link>
          {renderNav()}
          <div className="mt-auto">{renderAccount()}</div>
        </aside>

        <main className="w-full px-5 py-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
