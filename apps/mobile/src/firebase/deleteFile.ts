import { deleteObject, ref } from 'firebase/storage';

import { storage } from './firebase';

/**
 * Direct port of apps/web's IBDeleteFile.js. Deletes the underlying Storage object at `filePath`
 * (in practice, an image's full download URL - Firebase Storage's ref() accepts a gs:// path, a
 * plain storage path, or a https download URL interchangeably and resolves the same object from
 * any of them). Callers (ImagesGallery.tsx) treat this as best-effort, same as web's
 * IBImagesListOptions.jsx: a failed Storage delete still lets the image be dropped from the
 * project's array, because an orphaned file nobody links to is a far smaller problem than an
 * image the artist explicitly removed still showing up everywhere in the app.
 */
export function deleteFile(filePath: string): Promise<void> {
  const imageRef = ref(storage, filePath);
  return deleteObject(imageRef);
}
