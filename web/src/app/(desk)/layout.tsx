import type { ReactNode } from "react";

import { ConsoleShell } from "@/components/console/ConsoleShell";

/**
 * The console.
 *
 * Every signed-in page shares one frame: a sidebar that lists the sections and
 * carries the session, and the content beside it. The sections are grouped so
 * the menu can grow with the system without the queue itself being crowded out.
 */
export default function DeskLayout({ children }: { children: ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
