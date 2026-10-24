import type { Metadata } from "next";
import { Feedback } from "./Feedback";

export const metadata: Metadata = {
  title: "Feedback",
  description: "Rate what you just ate or tell BU Dining what you want on the menu. Always anonymous.",
  openGraph: { title: "Feedback — BU Big Backs", description: "Rate your meal or request a new dish. Always anonymous.", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function Page() {
  return <Feedback />;
}
