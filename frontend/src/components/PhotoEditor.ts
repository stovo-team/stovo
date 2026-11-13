/**
 * Shared photo-editing contract and pixel helpers.
 *
 * UI shells compose this core instead of inheriting from one another: sent
 * media enables drawing, while chat wallpaper explicitly disables it.
 */
export type PhotoEditorFeatures = Readonly<{
  drawing: boolean;
  crop: boolean;
  color: boolean;
  blur: boolean;
}>;

export const PHOTO_EDITOR_FEATURES = {
  media: { drawing: true, crop: true, color: true, blur: false },
  wallpaper: { drawing: false, crop: false, color: true, blur: true }
} as const satisfies Record<string, PhotoEditorFeatures>;

export const MAX_PHOTO_EDITOR_DIMENSION = 2048;

export function fitPhotoDimensions(width: number, height: number, maxDimension = MAX_PHOTO_EDITOR_DIMENSION) {
  const scale = Math.min(1, maxDimension / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

export function rotateNormalizedPoint(point: { x: number; y: number }, degrees: number) {
  switch (((degrees % 360) + 360) % 360) {
    case 90: return { x: 1 - point.y, y: point.x };
    case 180: return { x: 1 - point.x, y: 1 - point.y };
    case 270: return { x: point.y, y: 1 - point.x };
    default: return point;
  }
}

export function unrotateNormalizedPoint(point: { x: number; y: number }, degrees: number) {
  return rotateNormalizedPoint(point, (360 - degrees) % 360);
}

/** Compresses camera captures before they enter Android's size-limited encrypted outbox bridge. */
export async function optimizeCameraPhoto(file: File) {
  if (!file.type.startsWith("image/") || file.size <= 4 * 1024 * 1024) return file;
  if (typeof createImageBitmap !== "function") throw new Error("Image decoding is unavailable");
  const bitmap = await createImageBitmap(file);
  try {
    const size = fitPhotoDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo canvas is unavailable");
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const mimeType = "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), mimeType, 0.82));
    if (!blob) throw new Error("Photo compression failed");
    const outputMimeType = blob.type || mimeType;
    const extension = outputMimeType === "image/png" ? ".png" : ".jpg";
    const name = `${file.name.replace(/\.[^.]+$/, "")}${extension}`;
    return new File([blob], name, { type: outputMimeType, lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

export type PhotoAdjustments = Readonly<{
  brightness: number;
  contrast: number;
  gamma: number;
  hue?: number;
  saturation?: number;
  blur?: number;
}>;

export function buildPhotoFilter({ brightness, contrast, hue = 0, saturation = 100, blur = 0 }: PhotoAdjustments) {
  return [
    `brightness(${brightness}%)`,
    `contrast(${contrast}%)`,
    `hue-rotate(${hue}deg)`,
    `saturate(${saturation}%)`,
    `blur(${blur}px)`
  ].join(" ");
}

export function applyGammaCorrection(context: CanvasRenderingContext2D, width: number, height: number, gamma: number) {
  if (gamma === 1) return;
  const pixels = context.getImageData(0, 0, width, height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    pixels.data[index] = Math.round(255 * Math.pow(pixels.data[index] / 255, gamma));
    pixels.data[index + 1] = Math.round(255 * Math.pow(pixels.data[index + 1] / 255, gamma));
    pixels.data[index + 2] = Math.round(255 * Math.pow(pixels.data[index + 2] / 255, gamma));
  }
  context.putImageData(pixels, 0, 0);
}
