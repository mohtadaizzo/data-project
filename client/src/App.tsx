import { DashboardPage } from "./pages/DashboardPage";

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="relative overflow-hidden border-b border-harbor-900/10">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(26,55,64,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(26,55,64,0.06) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-harbor-600">
              Terminal portuaire · Tanger Med
            </p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-harbor-950 sm:text-5xl">
              EUROGATE
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <DashboardPage />
      </main>

      <footer className="border-t border-harbor-900/10 py-4 text-center text-xs text-steel-500">
        EUROGATE · Tanger Med
      </footer>
    </div>
  );
}
