import { Ticket } from "lucide-react";

/** The line along the bottom: what to do next, and the tagline. */
export function PublicDisplayFooter() {
  return (
    <footer className="myturn-display-footer">
      <p>
        <Ticket size={18} aria-hidden="true" />
        <span>Take a ticket here with the code, or at the entrance.</span>
      </p>
      <span>Your Turn, Made Simple.</span>
    </footer>
  );
}
