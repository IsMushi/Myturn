import { ArrowLeft, ListOrdered, Lock, ShieldCheck, SlidersHorizontal, Ticket } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "./Logo";
import "./auth-shell.css";

const TOOLS = [
  { icon: ListOrdered, title: "A queue you can follow", text: "See who is waiting and call the next visitor." },
  { icon: SlidersHorizontal, title: "Your desk, under control", text: "Pause service, recall a number or finish a visit." },
  { icon: ShieldCheck, title: "The right access", text: "Staff work the desk. Administrators manage the team." },
];

/** Shared account chrome; the form and its existing authentication stay separate. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="myturn-auth-shell">
      <aside className="myturn-auth-story" aria-label="About your workspace">
        <Link href="/" aria-label="MyTurn home" className="myturn-auth-brand">
          <Logo tone="light" />
        </Link>
        <div className="myturn-auth-story-content">
          <p className="myturn-auth-audience">Your service workspace</p>
          <h2>A calmer queue.<br />A clearer day.</h2>
          <p className="myturn-auth-intro">
            Welcome to the other side of the counter. Everything you need to keep service moving,
            in one place.
          </p>
          <ul className="myturn-auth-tools">
            {TOOLS.map(({ icon: Icon, title: toolTitle, text }) => (
              <li key={toolTitle}>
                <span className="myturn-auth-tool-icon"><Icon size={21} aria-hidden="true" /></span>
                <div><h3>{toolTitle}</h3><p>{text}</p></div>
              </li>
            ))}
          </ul>
        </div>
        <p className="myturn-auth-tagline">Your Turn, Made Simple.</p>
      </aside>

      <div className="myturn-auth-main">
        <header className="myturn-auth-topbar">
          <Link href="/" aria-label="MyTurn home" className="myturn-auth-mobile-brand"><Logo /></Link>
          <Link href="/" className="myturn-auth-back"><ArrowLeft size={16} aria-hidden="true" /> Back to home</Link>
        </header>

        <div className="myturn-auth-form-area">
          <div className="myturn-auth-form-content">
            <p className="myturn-auth-access"><Lock size={16} aria-hidden="true" /> Staff &amp; administrator access</p>
            <h1>{title}</h1>
            <p className="myturn-auth-subtitle">{subtitle}</p>
            <div className="myturn-auth-fields">{children}</div>
            {footer && <div className="myturn-auth-help">{footer}</div>}
            <div className="myturn-auth-visitor">
              <Ticket size={21} aria-hidden="true" />
              <div><p>Just here for a ticket?</p><Link href="/ticket">Join the queue. No account needed.</Link></div>
            </div>
          </div>
        </div>

        <footer className="myturn-auth-footer">MyTurn · Your Turn, Made Simple.</footer>
      </div>
    </div>
  );
}
