"use client";

/**
 * The create wizard's last screen: what the operator is about to send to the
 * Tourism Office.
 *
 * It is deliberately the same view as the editor's section cards
 * (`PackageSummary`), so a package looks identical while it is being created and
 * after it has been saved and reopened.
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { LineIcon } from "@/components/ui/icons";
import { PackageSummary } from "../components/package-summary";
import { draftChecklist, type PackageSectionId } from "../components/package-draft";
import type { EditPackageFormData } from "../[id]/edit/edit-types";

interface ReviewStepProps {
  draft: EditPackageFormData;
  onEdit: (section: PackageSectionId) => void;
}

export function ReviewStep({ draft, onEdit }: ReviewStepProps) {
  const checklist = draftChecklist(draft);
  const missing = checklist.filter((item) => !item.done);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Before you submit"
          description={
            missing.length === 0
              ? "Everything the Tourism Office needs is here."
              : "You can still submit, but these are worth adding first."
          }
        />
        <ul className="space-y-2">
          {checklist.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-daet-ink/85">
                <LineIcon
                  name={item.done ? "check" : "plus"}
                  className={`h-4 w-4 ${item.done ? "text-green-700 dark:text-green-300" : "text-daet-ink/50"}`}
                />
                {item.label}
              </span>
              {item.done ? (
                <Badge tone="success">Done</Badge>
              ) : (
                <button
                  type="button"
                  onClick={() => onEdit(item.section)}
                  className="min-h-11 rounded-full px-3 text-sm font-bold text-blue-700 underline-offset-4 hover:underline dark:text-blue-300"
                >
                  Add
                  <span className="sr-only"> {item.label.toLowerCase()}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <PackageSummary draft={draft} onEdit={onEdit} />
    </div>
  );
}
