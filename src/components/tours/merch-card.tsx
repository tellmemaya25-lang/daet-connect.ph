import { formatPeso, MERCH_CATEGORIES, type MerchItem } from "@/lib/tours/promo-validation";

const MERCH_ICONS: Record<MerchItem["category"], string> = {
  tshirt: "👕",
  mug: "☕",
  souvenir: "🎁",
  accessory: "🧢",
  pasalubong: "🥥",
  other: "🛍️",
};

/** Turns a phone number or URL into a tappable link; anything else stays plain text. */
function contactHref(contact: string): string | null {
  if (/^https?:\/\//i.test(contact)) return contact;
  const digits = contact.replace(/[\s()-]/g, "");
  if (/^\+?\d{7,15}$/.test(digits)) return `tel:${digits}`;
  return null;
}

export function MerchCard({ item }: { item: MerchItem }) {
  const price = formatPeso(item.price);
  const href = item.contact_info ? contactHref(item.contact_info) : null;

  return (
    <article className="flex w-full flex-col overflow-hidden rounded-2xl border border-daet-ink/10 bg-white shadow-sm">
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-daet-sand min-[420px]:aspect-square to-amber-100">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-6xl" aria-hidden="true">
            {MERCH_ICONS[item.category]}
          </div>
        )}
        {item.is_featured ? (
          <span className="absolute left-3 top-3 rounded-full bg-daet-sun px-3 py-1 text-xs font-black text-daet-ink shadow">★ Featured</span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-daet-leaf">{MERCH_CATEGORIES[item.category]}</p>
        <h3 className="mt-1 line-clamp-2 font-black text-daet-ink">{item.name}</h3>
        <p className="mt-1 text-lg font-black text-daet-forest">{price ?? "Ask seller"}</p>
        {item.description ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-daet-ink/65">{item.description}</p> : null}
        <div className="mt-3 space-y-1 text-sm text-daet-ink/70">
          <p>🏪 {item.seller_name}</p>
          {item.where_to_buy ? <p>📍 {item.where_to_buy}</p> : null}
        </div>
        {item.contact_info ? (
          <div className="mt-auto pt-4">
            {href ? (
              <a
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-daet-forest px-5 text-sm font-bold text-white hover:bg-daet-ink"
              >
                Contact seller
              </a>
            ) : (
              <p className="rounded-xl bg-daet-sand/60 px-3 py-2 text-sm text-daet-ink/75">📞 {item.contact_info}</p>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
