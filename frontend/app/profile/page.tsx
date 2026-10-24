import type { Metadata } from "next";
import { ProfilePage } from "./ProfilePage";

export const metadata: Metadata = {
  title: "My profile",
  description: "Your dietary restrictions, starred dishes and picks for today.",
  openGraph: { title: "My profile — BU Big Backs", description: "Your dietary restrictions, starred dishes and picks for today.", type: "website" },
  twitter: { card: "summary" },
};

export default function Page() {
  return <ProfilePage />;
}
