"use client";

/**
 * Read-only summary of a package, one card per section.
 *
 * The create wizard's review step renders it, and the editor's section cards
 * are meant to grow into the same thing, so both screens describe a package the
 * same way. It reads the editor's `EditPackageFormData`, which is the shape both
 * screens already hold.
 */

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import type { EditPackageFormData } from "../[id]/edit/edit-types";
import { formatDuration, type PackageSectionId } from "./package-draft";

function EditSectionButton({
  section,
  label,
  onEdit,
}: {
  section: PackageSectionId;
  label: string;
  onEdit?: (section: PackageSectionId) => void;
}) {
  if (!onEdit) return null;
  return (
    <Button variant="ghost" onClick={() => onEdit(section)} aria-label={`Edit ${label}`}>
      Edit
    </Button>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-daet-ink/70">{children}</p>;
}

function PriceSummary({ draft }: { draft: EditPackageFormData }) {
  if (draft.priceVariants.length === 0) return <Empty>No price options yet.</Empty>;

  return (
    <ul className="space-y-2">
      {draft.priceVariants.map((variant, index) => (
        <li
          key={variant.id ?? `${variant.variantName}-${index}`}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl bg-muted px-4 py-3"
        >
          <span className="min-w-0">
            <span className="font-bold text-daet-ink">{variant.variantName}</span>
            <span className="ml-2 text-sm text-daet-ink/75">
              {variant.minPax}
              {variant.maxPax === null ? " or more guests" : `–${variant.maxPax} guests`}
            </span>
            {variant.isDefault ? (
              <Badge tone="brand" className="ml-2 align-middle">
                Default
              </Badge>
            ) : null}
          </span>
          <span className="text-sm font-bold text-daet-ink">
            {variant.pricePerPax !== null
              ? `${formatPeso(variant.pricePerPax)} per guest`
              : `${formatPeso(variant.flatPrice)} for the group`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function IncludedSummary({ draft }: { draft: EditPackageFormData }) {
  const included = draft.inclusions.filter((item) => item.isIncluded);
  const excluded = draft.inclusions.filter((item) => !item.isIncluded);

  if (draft.inclusions.length === 0) return <Empty>Nothing listed yet.</Empty>;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="text-sm font-bold text-daet-ink">Included</p>
        {included.length === 0 ? (
          <p className="mt-1 text-sm text-daet-ink/70">Nothing marked as included.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {included.map((item, index) => (
              <li key={item.id ?? `in-${index}`} className="flex items-start gap-2 text-sm text-daet-ink/85">
                <LineIcon name="check" className="mt-0.5 h-4 w-4 text-green-700 dark:text-green-300" />
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-sm font-bold text-daet-ink">Not included</p>
        {excluded.length === 0 ? (
          <p className="mt-1 text-sm text-daet-ink/70">Nothing listed.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {excluded.map((item, index) => (
              <li key={item.id ?? `ex-${index}`} className="flex items-start gap-2 text-sm text-daet-ink/85">
                <LineIcon name="cancel" className="mt-0.5 h-4 w-4 text-daet-ink/50" />
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StopsSummary({ draft }: { draft: EditPackageFormData }) {
  if (draft.stops.length === 0) return <Empty>No stops yet.</Empty>;

  const ordered = [...draft.stops].sort((a, b) => a.stopOrder - b.stopOrder);

  return (
    <ol className="space-y-2">
      {ordered.map((stop, index) => (
        <li key={stop.id ?? `stop-${index}`} className="flex items-start gap-3 text-sm">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted-strong text-xs font-bold text-daet-ink">
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="font-bold text-daet-ink">{stop.locationName}</span>
            {stop.description ? <span className="block text-daet-ink/75">{stop.description}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function PhotosSummary({ draft }: { draft: EditPackageFormData }) {
  const total = (draft.coverImageUrl ? 1 : 0) + draft.galleryImages.length;

  if (total === 0) return <Empty>No photos yet.</Empty>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-daet-ink/80">
        {draft.coverImageUrl ? "Cover photo and " : ""}
        {draft.galleryImages.length} gallery {draft.galleryImages.length === 1 ? "photo" : "photos"}.
      </p>
      <ul className="flex flex-wrap gap-2">
        {[draft.coverImageUrl, ...draft.galleryImages.map((image) => image.imageUrl)]
          .filter((url): url is string => Boolean(url))
          .slice(0, 6)
          .map((url, index) => (
            <li key={`${url}-${index}`}>
              <Image
                src={url}
                alt={index === 0 && draft.coverImageUrl ? "Cover photo" : `Gallery photo ${index}`}
                width={72}
                height={72}
                className="h-16 w-16 rounded-2xl object-cover"
              />
            </li>
          ))}
      </ul>
    </div>
  );
}

export function PackageSummary({
  draft,
  onEdit,
}: {
  draft: EditPackageFormData;
  /** When given, every card gets an "Edit" button that jumps to its section. */
  onEdit?: (section: PackageSectionId) => void;
}) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Basics"
          action={<EditSectionButton section="basics" label="basics" onEdit={onEdit} />}
        />
        <div className="space-y-2">
          <p className="text-lg font-bold text-daet-ink">{draft.title || "No title yet"}</p>
          <p className="flex items-center gap-2 text-sm text-daet-ink/80">
            <LineIcon name="pin" className="h-4 w-4" />
            {draft.locationName || "No starting point yet"}
          </p>
          <p className="flex items-center gap-2 text-sm text-daet-ink/80">
            <LineIcon name="clock" className="h-4 w-4" />
            {formatDuration(draft.durationValue, draft.durationType)}
          </p>
          <p className="whitespace-pre-line text-sm leading-6 text-daet-ink/85">
            {draft.description ?? "No description yet."}
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Photos"
          action={<EditSectionButton section="photos" label="photos" onEdit={onEdit} />}
        />
        <PhotosSummary draft={draft} />
      </Card>

      <Card>
        <CardHeader
          title="Prices"
          action={<EditSectionButton section="prices" label="prices" onEdit={onEdit} />}
        />
        <PriceSummary draft={draft} />
      </Card>

      <Card>
        <CardHeader
          title="What's included"
          action={<EditSectionButton section="included" label="what's included" onEdit={onEdit} />}
        />
        <IncludedSummary draft={draft} />
      </Card>

      <Card>
        <CardHeader
          title="Route & stops"
          action={<EditSectionButton section="stops" label="route and stops" onEdit={onEdit} />}
        />
        <StopsSummary draft={draft} />
      </Card>
    </div>
  );
}
