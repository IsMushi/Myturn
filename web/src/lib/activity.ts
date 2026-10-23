/**
 * The words the interface uses for the events the server records.
 *
 * The three records — the waiting line, the desk and the accounts — each write
 * their own short key ("desk paused", "board moved"). The Activity page and the
 * administrator's Dashboard both show those lines, and a line that read one way
 * on one page and another way on the next would look like two different events.
 * The vocabulary therefore lives here, once.
 */

const LABELS: Record<string, string> = {
  created: "Ticket issued",
  called: "Called to the desk",
  requeued: "Missed its turn, re-issued at the back",
  completed: "Served",
  skipped: "Logged as a no-show",
  cancelled: "Cancelled",
  recalled: "Number announced again",
  undone: "Last decision taken back",
  "desk active": "Desk opened",
  "desk paused": "Desk paused",
  "desk closed": "Desk closed",
  "desk settings changed": "Desk settings changed",
  "desk added": "Desk added",
  "board moved": "Board moved to another desk",
  "service added": "Service added",
  "service settings changed": "Service settings changed",
  "service switched on": "Service switched on",
  "service switched off": "Service switched off",
  invited: "Invitation created",
  "invitation replaced": "Invitation replaced",
  "invitation revoked": "Invitation withdrawn",
  registered: "Account created from an invitation",
  profile: "Name changed",
  "switched on": "Account switched on",
  "switched off": "Account switched off",
  "role changed": "Administrator rights changed",
  "account deleted": "Account deleted",
  "password changed": "Password changed while signed in",
  "password reset": "Password reset from a link",
};

/**
 * What one recorded event is called on screen.
 *
 * A key this build has never seen is shown as the server wrote it rather than
 * being hidden: an unlabelled line is still the truth about what happened.
 */
export function activityLabel(event: string): string {
  return LABELS[event] ?? event;
}
