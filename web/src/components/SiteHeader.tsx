"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Logo } from "./Logo";
import { ButtonLink } from "./ui/Button";
import { homeStyles as styles } from "./public-home";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/#how", label: "How It Works" },
  { href: "/#features", label: "Features" },
  { href: "/#about", label: "About" },
];

/**
 * The site header.
 *
 * The four links are the public tour of the product. Signing in and taking a
 * ticket are the only two things a visitor can actually do, so they sit on the
 * right where they are easy to find.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("/");
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let frame = 0;
    function updateSection() {
      let current = "/";
      for (const id of ["how", "features", "about"]) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= 160) current = `/#${id}`;
      }
      setActive(current);
      frame = 0;
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(updateSection);
    }
    updateSection();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className={styles.header}>
      <a href="#main-content" className="myturn-home-skip">Skip to content</a>
      <nav className={`${styles.nav} flex items-center gap-3`} aria-label="Main navigation">
        <Link href="/" aria-label="MyTurn home" onClick={() => setOpen(false)}>
          <Logo />
        </Link>

        <ul className={`${styles.navLinks} hidden items-center gap-1 md:flex`}>
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={styles.navLink}
                aria-current={active === link.href ? (link.href === "/" ? "page" : "location") : undefined}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/auth/login"
            className={`${styles.signIn} hidden rounded-full px-3 py-2 font-semibold text-deep-green transition hover:bg-soft-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green sm:block`}
          >
            Sign In
          </Link>
          <ButtonLink href="/ticket" className={styles.headerTicket}>Get My Ticket</ButtonLink>
          <button
            type="button"
            ref={menuButton}
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close the menu" : "Open the menu"}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line p-2 text-deep-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="site-menu" className="border-t border-line bg-soft-mint md:hidden">
          <ul className="mx-auto w-full max-w-6xl space-y-1 px-5 py-3">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                   href={link.href}
                   aria-current={active === link.href ? (link.href === "/" ? "page" : "location") : undefined}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-base font-medium text-deep-green hover:bg-white/60"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/auth/login"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-base font-semibold text-medium-green hover:bg-white/60"
              >
                Sign In
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
