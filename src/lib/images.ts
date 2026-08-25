/**
 * Turning a picked or pasted image into something small enough to live on a
 * Firestore document. Uses the DOM, so it is here rather than in `src/domain`.
 */

import { MAX_IMAGE_BYTES, MAX_IMAGE_EDGE } from '../domain/training';

/** Tried in order until one comes in under the cap. */
const QUALITIES = [0.82, 0.7, 0.6, 0.5, 0.4];

async function decode(blob: Blob): Promise<{ width: number; height: number; source: CanvasImageSource }> {
  // createImageBitmap is the fast path and decodes off the main thread.
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return { width: bitmap.width, height: bitmap.height, source: bitmap };
  }

  // Fallback for older Safari. Object URLs must be revoked or the blob leaks
  // for the lifetime of the document.
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('That file could not be read as an image.'));
      element.src = url;
    });
    return { width: image.naturalWidth, height: image.naturalHeight, source: image };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Downscale to a JPEG data URL under `MAX_IMAGE_BYTES`.
 *
 * JPEG rather than PNG deliberately: these are photographs, and a PNG of a
 * photograph is several times the size for no visible gain. Transparency is
 * not a thing a picture of a pole move needs.
 */
export async function toStorableImage(blob: Blob): Promise<string> {
  const { width, height, source } = await decode(blob);
  if (width === 0 || height === 0) {
    throw new Error('That file could not be read as an image.');
  }

  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser will not let us resize the image.');

  // White underneath: a transparent PNG flattened onto JPEG's default black
  // makes a screenshot with a transparent margin unreadable.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  if ('close' in source && typeof source.close === 'function') source.close();

  for (const quality of QUALITIES) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_IMAGE_BYTES) return dataUrl;
  }

  throw new Error('That image is too detailed to store. Try a simpler crop.');
}

/** The first image on a paste, if there is one. */
export function imageFromClipboard(data: DataTransfer | null): Blob | null {
  if (!data) return null;

  for (const item of data.items) {
    if (!item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) return file;
  }

  return null;
}
