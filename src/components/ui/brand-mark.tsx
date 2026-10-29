import Link from "next/link";

/** The wordmark: the name in the display face, no badge or tagline. */
export function BrandMark() {
  return (
    <Link
      href="/"
      className="inline-flex min-h-11 shrink-0 items-center rounded-full font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-daet-ink sm:text-2xl"
    >
      CONNECT-Daet
      <span className="sr-only"> home</span>
    </Link>
  );
}
