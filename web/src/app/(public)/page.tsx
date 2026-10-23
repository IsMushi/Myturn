import type { Metadata } from "next";
import {
  Activity, ArrowRight, BellRing, CheckCircle2, Cpu, Hand, Lightbulb,
  Mail, MonitorSmartphone, Phone, QrCode, Radar, Ruler, ShieldCheck, Ticket, Wifi,
} from "lucide-react";
import Link from "next/link";

import { HeroSection } from "@/components/HeroSection";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "MyTurn — Your Turn, Made Simple.",
  description: "Take a ticket, follow your place and come to the desk when called. MyTurn connects visitors, staff and the service point in one queue.",
};

const STEPS = [
  { icon: QrCode, title: "Scan the code", body: "Open MyTurn from the QR code at the office. There is nothing to download." },
  { icon: Ticket, title: "Take your number", body: "Choose your service and get a ticket. No account needed; leave a phone number or email only if you want the desk to reach you." },
  { icon: BellRing, title: "Follow your turn", body: "Keep your ticket open to see your place and the number being served, without refreshing." },
  { icon: CheckCircle2, title: "Come when called", body: "When your number appears on your phone or the waiting-room display, head to the desk." },
];

const FEATURES = [
  { icon: Activity, title: "Know where you stand", body: "See how many tickets are ahead and follow your place as the queue moves." },
  { icon: MonitorSmartphone, title: "One view of the queue", body: "The ticket page and waiting-room display show updates from the same server." },
  { icon: Hand, title: "Staff stay in charge", body: "Call, recall, complete or requeue a ticket. Pause the service when you need a break." },
  { icon: ShieldCheck, title: "A ticket, not a profile", body: "Visitors stay anonymous. Their private ticket link is all they need to follow their turn." },
];

const DEVICES = [
  { icon: Ruler, title: "Distance", name: "HC-SR04", body: "Measures the distance at the service point. Only this sensor determines occupancy." },
  { icon: Radar, title: "Approach", name: "HC-SR501", body: "Detects movement near the desk. It does not decide whether the service point is occupied, and it cannot tell a visitor from anyone else who passes by." },
  { icon: Cpu, title: "Connection", name: "ESP32", body: "Sends sensor readings to the API over Wi-Fi and applies the desk's light setting." },
  { icon: Lightbulb, title: "Desk light", name: "RGB LED", body: "Green when open and free, red when occupied, yellow when paused or closed, and blue while a number is being called." },
];

/**
 * The project team.
 *
 * The address of each member is the one the school gives them: `ug` and the
 * digits of the registration number. The telephone numbers are placeholders
 * until the real ones are written in; a number that still carries an X is
 * shown as plain text rather than as a link that would not dial.
 */
const TEAM = [
  {
    name: "NIYODUHORANA Leah",
    registration: "25/27754",
    initials: "NL",
    email: "ug2527754@ines.ac.rw",
    phone: "+250 7XX XXX XXX",
  },
  {
    name: "DUKUNDIMANA Odilla",
    registration: "25/26987",
    initials: "DO",
    email: "ug2526987@ines.ac.rw",
    phone: "+250 7XX XXX XXX",
  },
  {
    name: "MUSHIMIYIMANA Isaac",
    registration: "24/25783",
    initials: "MI",
    email: "ug2425783@ines.ac.rw",
    phone: "+250 7XX XXX XXX",
  },
];

export default function HomePage() {
  return (
    <div className="myturn-home-page">
      <HeroSection />

      <section id="how" className="myturn-home-section myturn-home-how" aria-labelledby="how-heading">
        <div className="myturn-home-container">
          <div className="myturn-home-section-heading">
            <div><p className="myturn-home-kicker">From your phone to the service point</p><h2 id="how-heading">Your turn, in four simple steps.</h2></div>
            <p>A little less standing around.<br />A little more time for your day.</p>
          </div>
          <ol className="myturn-home-steps">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <li key={title}>
                <div className="myturn-home-step-top"><span>Step {index + 1}</span><Icon size={23} aria-hidden="true" /></div>
                <h3>{title}</h3><p>{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="myturn-home-section myturn-home-features" aria-labelledby="features-heading">
        <div className="myturn-home-container myturn-home-feature-layout">
          <div className="myturn-home-feature-intro">
            <p className="myturn-home-kicker">Made for both sides of the service point</p>
            <h2 id="features-heading">Less guessing.<br />More getting things done.</h2>
            <p>Visitors know when to come forward. Staff can focus on the person in front of them.</p>
            <Link href="/ticket" className="myturn-home-text-link">Take your first ticket <ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
          <div className="myturn-home-feature-list">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <article key={title}>
                <span className="myturn-home-feature-icon"><Icon size={23} aria-hidden="true" /></span>
                <div><h3>{title}</h3><p>{body}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="myturn-home-section myturn-home-hardware" aria-labelledby="hardware-heading">
        <div className="myturn-home-container">
          <div className="myturn-home-section-heading">
            <div><p className="myturn-home-kicker">The small things behind the service</p><h2 id="hardware-heading">Connected to the service point.</h2></div>
            <p>The board measures. The server manages the queue.<br />Staff decide who is served.</p>
          </div>
          <div className="myturn-home-device-list">
            {DEVICES.map(({ icon: Icon, title, name, body }) => (
              <article key={name}>
                <Icon size={28} aria-hidden="true" />
                <h3>{title}</h3><span>{name}</span><p>{body}</p>
              </article>
            ))}
          </div>
          <p className="myturn-home-sensor-note"><Wifi size={18} aria-hidden="true" /> The system does not count people or identify anyone. Sensors report distance and movement only.</p>
        </div>
      </section>

      <section id="about" className="myturn-home-section" aria-labelledby="about-heading">
        <div className="myturn-home-container">
          <div className="myturn-home-about-layout">
            <div>
              <p className="myturn-home-kicker">Built at INES Ruhengeri</p>
              <h2 id="about-heading">A practical project.<br />An everyday problem.</h2>
            </div>
            <div>
              <p className="myturn-home-about-text">MyTurn began with a familiar question: &ldquo;Who is next?&rdquo; Our Internet of Things project brings the queue, the service desk and the service point sensors into one system.</p>
              <p className="myturn-home-about-text">The application runs on our own Flask API, rather than a third-party IoT dashboard. Visitors take a number, staff work the queue, and the ESP32 reports what happens at the service point.</p>
            </div>
          </div>
          <section className="myturn-home-team-section" aria-labelledby="team-heading">
            <div className="myturn-home-team-heading">
              <h2 id="team-heading">Meet the project team</h2>
              <p>Industrial Information Technology<br />Level III · 2026</p>
            </div>
            <div className="myturn-home-profile-grid">
              {TEAM.map((member) => (
                <article key={member.registration} className="myturn-home-profile-card" aria-label={member.name}>
                  <span className="myturn-home-profile-avatar" aria-hidden="true">{member.initials}</span>
                  <h3>{member.name}</h3>
                  <p>Reg. No. {member.registration}</p>
                  <ul className="myturn-home-profile-contact">
                    <li>
                      <Mail aria-hidden="true" />
                      <a href={`mailto:${member.email}`}>{member.email}</a>
                    </li>
                    {member.phone && (
                      <li>
                        <Phone aria-hidden="true" />
                        {member.phone.includes("X") ? (
                          <span>{member.phone}</span>
                        ) : (
                          <a href={`tel:${member.phone.replace(/\s+/g, "")}`}>{member.phone}</a>
                        )}
                      </li>
                    )}
                  </ul>
                </article>
              ))}
            </div>
            <p className="myturn-home-team-description">Design and implementation of an IoT-based queue management and service desk status system.</p>
          </section>
        </div>
      </section>

      <section className="myturn-home-closing" aria-labelledby="closing-heading">
        <div className="myturn-home-container myturn-home-closing-inner">
          <div><h2 id="closing-heading">Ready to take your turn?</h2><p>Your next step is a ticket. No account, no download.</p></div>
          <div className="myturn-home-closing-actions">
            <ButtonLink href="/ticket" size="lg">Get My Ticket <ArrowRight size={18} aria-hidden="true" /></ButtonLink>
            <Link href="/auth/login" className="myturn-home-text-link">Working the desk? Sign in</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
