"use client";

/**
 * Client-side image downscaling (spec FR-8).
 *
 * A photo straight off a modern phone is 4–12 MB. Uploading six of those over
 * a phone connection from a customer's hallway is slow enough that people give
 * up on the form, and the owner does not need 48 megapixels to see a corroded
 * fitting. Scaling to a 1600px long edge cuts a typical photo to well under
 * 500 KB with no loss of anything diagnostic.
 *
 * Done with createImageBitmap + OffscreenCanvas where available, falling back
 * to a plain canvas. HEIC from an iPhone is the awkward case: Safari decodes it
 * natively so this works there, and on the browsers that cannot, we upload the
 * original rather than rejecting the customer's photo.
 */

export const MAX_PHOTOS = 6;
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_EDGE = 1600;

export const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export interface PreparedImage {
  file: File;
  previewUrl: string;
  originalBytes: number;
  finalBytes: number;
}

export type PrepareResult =
  | { ok: true; image: PreparedImage }
  | { ok: false; error: string };

function isAccepted(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  // Some Android browsers hand over an empty MIME type; fall back to extension.
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

async function drawToBlob(source: ImageBitmap, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.drawImage(source, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(source, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

export async function prepareImage(file: File): Promise<PrepareResult> {
  if (!isAccepted(file)) {
    return { ok: false, error: "We can accept JPG, PNG, WebP or HEIC photos." };
  }

  const originalBytes = file.size;

  try {
    const bitmap = await createImageBitmap(file);

    let blob = await drawToBlob(bitmap, 0.82);

    // One more pass at lower quality for the rare photo that is still large
    // after scaling — usually a very detailed scene rather than a big canvas.
    if (blob && blob.size > MAX_BYTES) {
      blob = await drawToBlob(bitmap, 0.6);
    }

    bitmap.close();

    if (!blob) throw new Error("Canvas produced no image");

    if (blob.size > MAX_BYTES) {
      return {
        ok: false,
        error: "That photo is too large. Try taking it again at a lower quality.",
      };
    }

    const prepared = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    return {
      ok: true,
      image: {
        file: prepared,
        previewUrl: URL.createObjectURL(blob),
        originalBytes,
        finalBytes: prepared.size,
      },
    };
  } catch {
    // The browser could not decode it — most often HEIC outside Safari.
    // Upload the original rather than turning the customer away, provided it
    // is within the size limit the server will accept anyway.
    if (originalBytes > MAX_BYTES) {
      return {
        ok: false,
        error:
          "We could not read that photo, and it is too large to send as-is. Try taking a screenshot of it instead.",
      };
    }

    return {
      ok: true,
      image: {
        file,
        previewUrl: URL.createObjectURL(file),
        originalBytes,
        finalBytes: originalBytes,
      },
    };
  }
}

/** "2.4 MB" — for telling the user what they just attached. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
