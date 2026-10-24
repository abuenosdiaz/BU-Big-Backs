import MenuExplorer from "./components/MenuExplorer";
import VeganOutlook from "./components/VeganOutlook";

export default function Home() {
  return (
    <div className="min-h-full bg-zinc-50 font-sans dark:bg-black">
      {/* Header */}
      <header className="border-b border-black/[.08] bg-white dark:border-white/[.12] dark:bg-zinc-950">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-6">
          <div className="flex items-center gap-2">
            <span className="text-xl">🍔</span>
            <h1 className="text-xl font-semibold tracking-tight text-black dark:text-zinc-50">
              BU Big Backs
            </h1>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Rate and find the best food in BU&apos;s dining halls.
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-8">
        {/* Vegan outlook */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Vegan availability outlook
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Per-hall vegan entrée availability today versus the upcoming window.
            </p>
          </div>
          <VeganOutlook />
        </section>

        {/* Menu explorer */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Explore the menus
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Filter upcoming dishes by hall, date, meal, and dietary needs.
            </p>
          </div>
          <MenuExplorer />
        </section>
      </main>

      <footer className="border-t border-black/[.08] py-6 dark:border-white/[.12]">
        <p className="mx-auto max-w-6xl px-6 text-xs text-zinc-400">
          Menu data polled from BU&apos;s dining API. Updated daily.
        </p>
      </footer>
    </div>
  );
}
