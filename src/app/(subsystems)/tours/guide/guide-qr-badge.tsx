"use client";

export function GuideQrBadge({
  guideId,
  fullName,
  qrDataUrl,
  validUntil,
}: {
  guideId: string;
  fullName: string;
  qrDataUrl: string;
  validUntil?: string;
}) {
  return (
    <section className="mx-auto max-w-xl print:max-w-none">
      <div className="rounded-3xl border border-daet-ink/10 bg-white p-6 text-center shadow-card sm:p-9 print:mx-auto print:min-h-[5in] print:w-[3.5in] print:rounded-none print:border-black print:p-4 print:shadow-none">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-daet-leaf print:text-black">CONNECT-DAET · Local Guide</p>
        <h1 className="mt-2 text-2xl font-black text-daet-ink print:text-black">{fullName}</h1>
        <div className="mx-auto mt-5 w-fit rounded-2xl bg-white p-3 print:mt-3 print:p-1">
          <img src={qrDataUrl} alt={`Approved guide QR code for ${fullName}`} width={420} height={420} className="h-56 w-56 sm:h-64 sm:w-64 print:h-[2.55in] print:w-[2.55in]" />
        </div>
        <p className="mt-4 text-sm font-bold text-emerald-800 print:text-black">Accredited guide</p>
        {validUntil ? <p className="mt-1 text-xs font-semibold text-daet-ink/65 print:text-black">Badge valid until {validUntil}</p> : null}
        <p className="mt-1 break-all text-[10px] text-daet-ink/70 print:text-black">Guide reference · {guideId}</p>
        <p className="mt-3 text-xs leading-5 text-daet-ink/70 print:text-black">Scan to verify. This QR contains only a signed guide reference, not ID information.</p>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row print:hidden">
        <a
          href={qrDataUrl}
          download={`connect-daet-guide-badge-${guideId.slice(0, 8)}.png`}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white transition hover:bg-daet-ink"
        >
          Download QR as PNG
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-daet-ink/15 px-6 text-sm font-bold text-daet-ink transition hover:bg-daet-sand"
        >
          Print badge
        </button>
      </div>
    </section>
  );
}
