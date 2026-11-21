/** Shown while the activity log loads or a filter is applied. It has the page's shape (heading, filters, table rows). */
export default function ActivityLoading() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Loading the activity log
      </p>
      <div className="animate-pulse space-y-4" aria-hidden="true">
        <div className="h-9 w-48 rounded-2xl bg-daet-ink/10" />
        <div className="h-4 w-full max-w-xl rounded-full bg-daet-ink/10" />
        <div className="h-12 rounded-2xl bg-daet-ink/10" />
        <div className="space-y-2 rounded-2xl bg-daet-ink/5 p-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-10 rounded-xl bg-daet-ink/10" />
          ))}
        </div>
      </div>
    </div>
  );
}
