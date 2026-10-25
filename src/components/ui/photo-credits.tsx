import { PHOTOS, type PhotoKey } from "@/lib/photo-credits";

/** One small line crediting the photographs on a page, each linked to its source and licence. */
export function PhotoCredits({ keys }: { keys: PhotoKey[] }) {
  return (
    <p className="text-sm leading-6 text-daet-ink/70">
      Photos via Wikimedia Commons:{" "}
      {keys.map((key, index) => {
        const photo = PHOTOS[key];
        return (
          <span key={key}>
            {index > 0 ? " · " : ""}
            <a href={photo.sourceUrl} className="underline underline-offset-2">
              {photo.title}
            </a>{" "}
            by {photo.creator} (
            <a href={photo.licenceUrl} className="underline underline-offset-2">
              {photo.licence}
            </a>
            )
          </span>
        );
      })}
      .
    </p>
  );
}
