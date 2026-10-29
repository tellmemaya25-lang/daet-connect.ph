"use client";

import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { usePromoForm } from "@/components/tours/use-promo-form";
import { PromoCheckbox, PromoField, PromoImageField, promoInputClass } from "@/components/tours/promo-fields";
import { MERCH_CATEGORIES, type MerchItem, type PromoFormState } from "@/lib/tours/promo-validation";
import { saveMerch } from "./actions";

/** Admin product form; operators reuse it (mode="operator") to submit products for approval. */
export function MerchForm({
  item,
  mode = "admin",
  action = saveMerch,
}: {
  item?: MerchItem;
  mode?: "admin" | "operator";
  action?: (prev: PromoFormState, formData: FormData) => Promise<PromoFormState>;
}) {
  const { state, pending, onSubmit } = usePromoForm(action);
  const operator = mode === "operator";
  const errors = state.errors;
  const invalid = (field: string) => (errors[field] ? true : undefined);

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}

      {state.message ? <Notice variant="error">{state.message}</Notice> : null}

      <PromoField id="name" label="Product name" required error={errors.name}>
        <input id="name" name="name" defaultValue={item?.name} maxLength={120} required aria-invalid={invalid("name")} className={promoInputClass} placeholder="e.g. I ♥ Daet T-shirt" />
      </PromoField>

      <div className="grid gap-5 sm:grid-cols-2">
        <PromoField id="category" label="Category" required error={errors.category}>
          <select id="category" name="category" defaultValue={item?.category ?? "tshirt"} aria-invalid={invalid("category")} className={promoInputClass}>
            {Object.entries(MERCH_CATEGORIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </PromoField>
        <PromoField id="price" label="Price (₱)" hint="Leave blank to show “Ask seller”." error={errors.price}>
          <input id="price" name="price" inputMode="decimal" defaultValue={item?.price ?? ""} aria-invalid={invalid("price")} className={promoInputClass} placeholder="350" />
        </PromoField>
      </div>

      <PromoField id="sellerName" label="Seller / shop name" required error={errors.sellerName}>
        <input id="sellerName" name="sellerName" defaultValue={item?.seller_name} maxLength={120} required aria-invalid={invalid("sellerName")} className={promoInputClass} />
      </PromoField>

      <div className="grid gap-5 sm:grid-cols-2">
        <PromoField id="whereToBuy" label="Where to buy" error={errors.whereToBuy}>
          <input id="whereToBuy" name="whereToBuy" defaultValue={item?.where_to_buy ?? ""} maxLength={200} aria-invalid={invalid("whereToBuy")} className={promoInputClass} placeholder="e.g. Pasalubong Center, Vinzons Ave." />
        </PromoField>
        <PromoField id="contactInfo" label="Contact" hint="Phone, Facebook page, or website" error={errors.contactInfo}>
          <input id="contactInfo" name="contactInfo" defaultValue={item?.contact_info ?? ""} maxLength={200} aria-invalid={invalid("contactInfo")} className={promoInputClass} />
        </PromoField>
      </div>

      <PromoField id="description" label="Description" error={errors.description}>
        <textarea id="description" name="description" defaultValue={item?.description ?? ""} rows={4} maxLength={1000} aria-invalid={invalid("description")} className={promoInputClass} />
      </PromoField>

      <PromoImageField currentUrl={item?.image_url ?? null} error={errors.image} />

      <div className="grid gap-3 sm:grid-cols-2">
        <PromoCheckbox name="isActive" label={operator ? "Show once approved" : "Show in the merchandise section"} defaultChecked={item?.is_active ?? true} />
        {operator ? null : <PromoCheckbox name="isFeatured" label="Feature on the home page" defaultChecked={item?.is_featured ?? false} />}
      </div>

      {operator ? (
        <Notice variant="info">The Tourism Office reviews every product before it appears on the merch showcase. Editing an approved product sends it for review again.</Notice>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href={operator ? "/tours/operator/merch" : "/tours/admin/merch"} className="inline-flex min-h-11 items-center justify-center rounded-full border border-daet-ink/20 px-6 text-sm font-bold text-daet-ink hover:bg-daet-sand">
          Cancel
        </Link>
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
          {pending ? "Saving…" : operator ? (item ? "Save and resubmit" : "Submit for approval") : item ? "Save changes" : "Add product"}
        </button>
      </div>
    </form>
  );
}
