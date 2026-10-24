import type { Metadata } from "next";
import { SettingsPage } from "./SettingsPage";

export const metadata: Metadata = {
  title: "Settings",
  description: "Set your dietary restrictions, home dining hall, location and notifications.",
  openGraph: { title: "Settings — BU Big Backs", description: "Set your dietary restrictions, home dining hall, location and notifications.", type: "website" },
  twitter: { card: "summary" },
};

export default function Page() {
  return <SettingsPage />;
}
