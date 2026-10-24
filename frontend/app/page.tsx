import type { Metadata } from "next";
import { Home } from "./Home";

export const metadata: Metadata = {
  title: { absolute: "BU Big Backs — Most loved dishes on campus" },
  description: "The most loved BU dining hall dishes, ranked by students. Tap the heart to vote.",
  openGraph: { title: "BU Big Backs — Most loved dishes on campus", description: "The most loved BU dining hall dishes, ranked by students.", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function Page() {
  return <Home />;
}
