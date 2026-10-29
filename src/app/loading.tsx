export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8" aria-busy="true">
      <p role="status" className="sr-only">
        Loading
      </p>
      <div className="animate-pulse space-y-6" aria-hidden="true">
        <div className="h-10 w-2/3 max-w-md rounded-2xl bg-daet-ink/10" />
        <div className="h-5 w-1/2 max-w-sm rounded-full bg-daet-ink/10" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-56 rounded-2xl bg-daet-ink/10" />
          <div className="h-56 rounded-2xl bg-daet-ink/10" />
          <div className="h-56 rounded-2xl bg-daet-ink/10" />
        </div>
      </div>
    </main>
  );
}
