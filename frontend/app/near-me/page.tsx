import type { Metadata } from "next";
import { NearMe } from "./NearMe";

export const metadata: Metadata = {
  title: "Near me",
  description: "See what's being served at the BU dining halls closest to you, matched to your restrictions.",
  openGraph: { title: "Near me — BU Big Backs", description: "What's being served closest to you on campus right now.", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function Page() {
  return <NearMe />;
}
