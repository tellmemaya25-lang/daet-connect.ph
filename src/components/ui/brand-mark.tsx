import Link from "next/link";

export function BrandMark() {
  return (
    <Link href="/" className="inline-flex min-h-11 shrink-0 items-center gap-3 rounded-full">
      <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-2xl bg-daet-forest text-sm font-black tracking-tight text-white shadow-sm">
        CD
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-black tracking-[0.12em] text-daet-ink">CONNECT-DAET</span>
        <span className="block text-[11px] font-semibold tracking-[0.16em] text-daet-leaf">TOURISM</span>
      </span>
      <span className="sr-only"> home</span>
    </Link>
  );
}
