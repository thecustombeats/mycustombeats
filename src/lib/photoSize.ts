import type { PhotoCheck } from "./personalisation";

/**
 * A chosen photograph's pixel size, read in this browser only — nothing is
 * uploaded to check it. Null when the browser cannot decode the file (for
 * example HEIC outside Safari), which is treated as "not confirmed
 * artwork-ready". The server checks the uploaded file again.
 */
export const readPhotoSize = async (file: Blob): Promise<PhotoCheck> => {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    }
  } catch {
    // Fall back to an <img> below.
  }
  if (typeof Image === "undefined" || typeof URL === "undefined") return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
};
