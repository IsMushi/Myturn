import type { Metadata } from "next";

import { DisplayBoard } from "@/components/DisplayBoard";

export const metadata: Metadata = {
  title: "Waiting room — MyTurn",
  description: "The number being served and how many visitors are still waiting.",
};

/**
 * The screen on the waiting-room wall.
 *
 * It carries no site header or sidebar: on a television there is nothing to
 * browse, so the page is only the numbers, large enough to read from across the
 * room. The logo in the display's own header links back to the site.
 */
export default function DisplayPage() {
  return <DisplayBoard />;
}
