import { ArrowRight, CircleX, Play, Radio, Smartphone } from "lucide-react";

import { HeroVisual } from "@/components/HeroVisual";
import { ButtonLink } from "@/components/ui/Button";

import { homeStyles as styles } from "./public-home";

const TRUST = [
  { icon: Smartphone, label: "Works on any phone" },
  { icon: CircleX, label: "No account needed" },
  { icon: Radio, label: "Live queue updates" },
];

export function HeroSection() {
  return (
    <section className={styles.hero} aria-labelledby="home-heading">
      <div className={styles.heroInner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>
            <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              Your Turn, Made Simple.
          </p>

          <h1 id="home-heading" className={styles.headline}>
            Less Waiting.
            <br />
            Better Service.
          </h1>

          <p className={styles.description}>
            Take a ticket, follow your place and know when to go to the desk.
            No more wondering who is next.
          </p>

          <div className={styles.actions}>
            <ButtonLink href="/ticket" size="lg" className={styles.primaryAction}>
              Get My Ticket
              <ArrowRight className="size-5" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="/#how" variant="quiet" size="lg" className={styles.secondaryAction}>
              <Play className="size-5" aria-hidden="true" />
              See how it works
            </ButtonLink>
          </div>

          <ul className={styles.trust}>
            {TRUST.map(({ icon: Icon, label }) => (
              <li key={label}>
                <span className={styles.trustIcon}>
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <HeroVisual />
    </section>
  );
}
