/**
 * Shrink an image in the browser before it goes anywhere.
 *
 * A modern phone photo is several megapixels; nothing in aOS renders one
 * bigger than a card. Uploading the original would cost the member their data
 * allowance, the project its storage, and everyone else the download. Shared
 * by the headshot field and the Archivio template upload so the two don't
 * drift on quality or orientation handling.
 *
 * `imageOrientation: "from-image"` applies the EXIF rotation, so a photo taken
 * sideways doesn't come back sideways. If anything here fails the caller
 * uploads the original unchanged — resizing is an optimisation, not a gate.
 */
export async function resizeImage(file: File, maxEdge: number, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas context");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Canvas produced nothing");
  return blob;
}
