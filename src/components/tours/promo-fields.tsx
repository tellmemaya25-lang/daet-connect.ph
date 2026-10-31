import { controlClasses, Field } from "@/components/ui/field";

export const promoInputClass = controlClasses;

/** Label + hint + error wrapper (shared UI kit `Field`). */
export const PromoField = Field;

export function PromoCheckbox({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl bg-canvas p-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 h-5 w-5 accent-daet-forest" />
      <span>
        <span className="block text-sm font-bold text-daet-ink">{label}</span>
        {description ? <span className="block text-sm text-slate-600 dark:text-slate-400">{description}</span> : null}
      </span>
    </label>
  );
}

export function PromoImageField({ currentUrl, error }: { currentUrl: string | null; error?: string }) {
  return (
    <PromoField id="image" label="Image" hint="JPG, PNG, or WebP up to 5 MB." error={error}>
      {currentUrl ? (
        <div className="mt-2 flex items-center gap-3">
          <img src={currentUrl} alt="Current image" className="h-20 w-20 rounded-2xl object-cover" />
          <label className="flex min-h-11 items-center gap-2 text-sm text-daet-ink/70">
            <input type="checkbox" name="removeImage" className="h-5 w-5 accent-red-600" />
            Remove current image
          </label>
        </div>
      ) : null}
      <input
        id="image"
        name="image"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-invalid={error ? true : undefined}
        className="mt-2 block w-full text-sm text-daet-ink file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-daet-forest file:px-4 file:text-sm file:font-bold file:text-white"
      />
    </PromoField>
  );
}
