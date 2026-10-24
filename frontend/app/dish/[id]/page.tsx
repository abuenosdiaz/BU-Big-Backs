import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/SiteHeader";
import { DishPage } from "./DishPage";

export const metadata: Metadata = {
  title: "Dish details",
  description: "Ingredients, nutrition, allergens and student comments for this BU dining hall dish.",
  openGraph: { title: "Dish details — BU Big Backs", description: "Ingredients, nutrition, allergens and student comments for this BU dining hall dish.", type: "article" },
  twitter: { card: "summary_large_image" },
};

export default function Page() {
  // The dish id comes from the URL, so the page streams in after the header.
  return (
    <Suspense
      fallback={
        <PageShell>
          <div className="mt-6 aspect-[16/9] animate-pulse rounded-2xl bg-muted" />
        </PageShell>
      }
    >
      <DishPage />
    </Suspense>
  );
}
