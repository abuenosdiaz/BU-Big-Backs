import type { Metadata } from "next";
import { Forums } from "./Forums";

export const metadata: Metadata = {
  title: "Dining hall forums",
  description: "Talk about each BU dining hall — lines, vibes, seating, staff. Everyone posts anonymously.",
  openGraph: { title: "Dining hall forums — BU Big Backs", description: "Anonymous forums for every BU dining hall.", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function Page() {
  return <Forums />;
}
