import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

import { storage } from './firebase';

/**
 * Direct port of apps/web's IBUploadFileWithProgress.js, adapted for the one real difference
 * between a browser and RN here: web's caller already holds a `File` (from `<input type=file>`,
 * a Blob subclass uploadBytesResumable accepts directly). expo-image-picker instead hands back a
 * local file URI (`file://...` on iOS, a `content://...` URI on Android) - a path, not file data.
 * `fetch(fileUri)` is RN's documented way to read a local file's bytes into a Blob (RN's fetch
 * polyfill supports the file:// scheme for exactly this); `.blob()` on the response is then a
 * real Blob, which is what uploadBytesResumable actually needs.
 *
 * subFolder/imageName/setProgress semantics are unchanged from web: subFolder is the full path
 * this image's siblings all share (already run through utils/imagePath.ts's
 * formatImagePathForFirebaseStorage by the caller), imageName is the file's own name within it,
 * and onProgress is called with a 0-100 percentage as Firebase reports bytesTransferred/totalBytes.
 */
export function uploadFileWithProgress(
  fileUri: string,
  subFolder: string,
  imageName: string,
  onProgress: (progress: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const response = await fetch(fileUri);
        const blob = await response.blob();
        const storageRef = ref(storage, `${subFolder}/${imageName}`);
        const upload = uploadBytesResumable(storageRef, blob);
        upload.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            onProgress(progress);
          },
          (error) => {
            reject(error);
          },
          async () => {
            try {
              const url = await getDownloadURL(storageRef);
              resolve(url);
            } catch (err) {
              reject(err);
            }
          },
        );
      } catch (err) {
        reject(err);
      }
    })();
  });
}
