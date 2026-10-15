/** Fit landscape participant tiles inside the measured stage, including gaps. */
export function getCallGallerySize(width: number, height: number, count: number, columns: number) {
  const gap = 8;
  const rows = Math.ceil(count / columns);
  const tileWidth = Math.max(0, Math.min((width - gap * (columns - 1)) / columns, (height - gap * (rows - 1)) / rows * 16 / 9));
  return { width: tileWidth * columns + gap * (columns - 1), height: tileWidth * 9 / 16 * rows + gap * (rows - 1) };
}
