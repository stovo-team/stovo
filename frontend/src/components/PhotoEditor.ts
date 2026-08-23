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
