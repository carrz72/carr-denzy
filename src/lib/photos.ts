"use client";

/**
 * Client-side photo handling for the enquiry form.
 *
 * A modern phone camera produces 4–12 MB per shot. Six of those is a 50 MB
 * upload from someone standing in a flooded kitchen on 4G, and it will fail.
 * Downscaling to a 1600px longest edge before upload (spec FR-8) takes the
 * typical photo to roughly 200–400 KB while staying more than sharp enough to
 * see a corroded fitting.
 *
 * HEIC is accepted at the picker because that is what an iPhone produces by
 * default, but browsers cannot decode it to a canvas. Those pass through
 * un-resized rather than being rejected — a large upload beats telling a
 * customer their photo is the wrong sort.
 */

export const MAX_PHOTOS = 6;
export const MAX_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export interface PreparedPhoto {
  /** The file to upload — downscaled where the browser could decode it. */
  file: File;
  /** Object URL for the preview thumbnail. Revoke it when the photo is removed. */
  previewUrl: string;
  originalName: string;
  bytes: number;
}

export type PrepareResult =
  | { ok: true; photo: PreparedPhoto }
  | { ok: false; error: string };

function canDecodeInCanvas(type: string): boolean {
  // Safari reports HEIC support inconsistently, and a failed decode produces a
  // blank canvas rather than an error. Not worth the risk.
  return type === "image/jpeg" || type === "image/png" || type === "image/webp";
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };

    image.src = url;
  });
}

/**
 * Validates and downscales one file.
 *
 * Never throws — the caller is a form, and a form should report a problem with
 * one photo without discarding the other five (spec E-2, E-3).
 */
export async function preparePhoto(file: File): Promise<PrepareResult> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return {
      ok: false,
      error: `${file.name} is not a photo we can read. We can accept JPG, PNG, WebP or HEIC.`,
    };
  }

  if (!canDecodeInCanvas(file.type)) {
    if (file.size > MAX_BYTES) {
      return {
        ok: false,
        error: `${file.name} is too large. Try taking it again at a lower quality.`,
      };
    }

    return {
      ok: true,
      photo: {
        file,
        previewUrl: URL.createObjectURL(file),
        originalName: file.name,
        bytes: file.size,
      },
    };
  }

  try {
    const image = await loadImage(file);
    const longestEdge = Math.max(image.width, image.height);
    const scale = longestEdge > MAX_EDGE ? MAX_EDGE / longestEdge : 1;

    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      return { ok: false, error: `We could not process ${file.name}. Try a different photo.` };
    }

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });

    if (!blob) {
      return { ok: false, error: `We could not process ${file.name}. Try a different photo.` };
    }

    // Belt and braces: a huge PNG of noise can survive the resize and still be
    // over the limit.
    if (blob.size > MAX_BYTES) {
      return {
        ok: false,
        error: `${file.name} is too large even after resizing. Try taking it again at a lower quality.`,
      };
    }

    const resized = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    return {
      ok: true,
      photo: {
        file: resized,
        previewUrl: URL.createObjectURL(resized),
        originalName: file.name,
        bytes: resized.size,
      },
    };
  } catch {
    return {
      ok: false,
      error: `We could not read ${file.name}. Try a different photo.`,
    };
  }
}

/** "2.4 MB" / "384 KB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A collision-resistant object key. The random suffix matters: two people
 * photographing a boiler on an iPhone both upload `IMG_0001.jpg`, and without
 * it the second would silently overwrite the first.
 */
export function storageKey(prefix: string, fileName: string): string {
  const safe = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-60);

  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `${prefix}/${Date.now()}-${random}-${safe || "photo.jpg"}`;
}
