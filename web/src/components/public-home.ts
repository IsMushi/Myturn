import "./public-home.css";

// The configured Tailwind Turbopack loader treats every stylesheet as global.
// Namespaced classes keep this landing-page styling out of the other routes.
export const homeStyles = {
  hero: "myturn-home-hero",
  heroInner: "myturn-home-inner",
  copy: "myturn-home-copy",
  eyebrow: "myturn-home-eyebrow",
  headline: "myturn-home-headline",
  description: "myturn-home-description",
  actions: "myturn-home-actions",
  primaryAction: "myturn-home-primary",
  secondaryAction: "myturn-home-secondary",
  trust: "myturn-home-trust",
  trustIcon: "myturn-home-trust-icon",
  visual: "myturn-home-visual",
  scene: "myturn-home-scene",
  livePanel: "myturn-home-live-panel",
  header: "myturn-home-header",
  nav: "myturn-home-nav",
  navLinks: "myturn-home-nav-links",
  navLink: "myturn-home-nav-link",
  signIn: "myturn-home-sign-in",
  headerTicket: "myturn-home-header-ticket",
} as const;
