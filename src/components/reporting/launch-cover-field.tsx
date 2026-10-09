import Image from "next/image";

import { Card, SectionTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";

/**
 * §6.1's cover image — optional, and Nina's decision 12.
 *
 * Two plain forms posting to a route handler, so neither needs
 * JavaScript: one to put a picture on, one to take it off. A launch
 * mid-flight is not blocked on finding a photo, and the card reads
 * perfectly well without one.
 *
 * `signedUrl` is signed by the page, which means the bucket stays
 * private: a client cannot read the cover of a draft launch, because the
 * same `report_can_read_launch` that hides the launch hides its picture.
 */
export function LaunchCoverField({
  launchId,
  signedUrl,
  returnTo,
  locked,
  error,
}: {
  launchId: string;
  /** Null when there is no cover, or when it could not be signed. */
  signedUrl: string | null;
  returnTo: string;
  locked: boolean;
  error?: string;
}) {
  return (
    <Card className="mb-6">
      <SectionTitle aside="optional">Cover image</SectionTitle>

      {signedUrl ? (
        <div className="relative mb-4 aspect-[3/1] w-full overflow-hidden rounded-xl bg-cream-deep">
          <Image
            src={signedUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 640px"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : (
        <p className="mb-4 text-small text-ink/60">
          No cover yet. The launch card and its report read perfectly well
          without one.
        </p>
      )}

      {error ? (
        <p role="alert" className="mb-4 text-small text-deep-red">
          {error}
        </p>
      ) : null}

      {locked ? (
        <p className="text-small text-ink/60">
          This launch is published, so its cover is fixed with everything
          else on the report. Unpublish it to change the picture.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <form
            action="/api/launch-cover"
            method="post"
            encType="multipart/form-data"
            className="flex flex-wrap items-center gap-3"
          >
            <input type="hidden" name="launch_id" value={launchId} />
            <input type="hidden" name="return_to" value={returnTo} />
            <input
              type="file"
              name="cover"
              accept="image/jpeg,image/png,image/webp"
              required
              aria-label="Cover image"
              className="max-w-full text-small text-ink file:mr-3 file:rounded-full file:border file:border-ink/12 file:bg-card file:px-4 file:py-2 file:text-small file:text-ink"
            />
            <button type="submit" className={buttonClasses("primary", "sm")}>
              {signedUrl ? "Replace it" : "Add a cover"}
            </button>
          </form>

          {signedUrl ? (
            <form action="/api/launch-cover" method="post">
              <input type="hidden" name="launch_id" value={launchId} />
              <input type="hidden" name="return_to" value={returnTo} />
              <input type="hidden" name="remove" value="1" />
              <button type="submit" className={buttonClasses("secondary", "sm")}>
                Remove it
              </button>
            </form>
          ) : null}
        </div>
      )}

      <p className="mt-3 text-caption text-ink/50">
        JPEG, PNG or WebP, up to 5&nbsp;MB.
      </p>
    </Card>
  );
}
