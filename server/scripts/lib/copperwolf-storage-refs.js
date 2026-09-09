// Firebase Storage lives entirely outside Mongo: every uploaded image is just a full download URL
// string sitting on some Mongo document (see utils/firebase-admin.js's uploadPublicFile and the
// client's firebase/IBUploadFile.js - both mint the same getDownloadURL()-style URL).
// scripts/export-copperwolf-snapshot.js needs to find every one of those URLs across the whole
// database so it can pull the actual files down alongside the Mongo documents that reference them
// - restoring the Mongo snapshot without the files behind it would just mean every image 404s the
// moment scripts/seed-copperwolf.js wipes Storage on the next reseed (see that script's header).
//
// One entry per model that has ANY field holding a Storage URL, found by grepping models/*.js for
// url/Url/photo/avatar/image-shaped fields on 2026-09-05. A model with none of these listed
// contributes nothing, which is the common case - most models have no images at all.
const EXTRACTORS = {
  User: (doc) => [doc.avatar],
  Client: (doc) => [doc.avatar],
  Artist: (doc) => [doc.avatar],
  Staff: (doc) => [doc.avatar],
  Project: (doc) => {
    // referenceImages/bodyImages/designImages are all [IBImageSchema] (models/IBImage.js), which
    // carries its own two Storage URLs per entry: the image itself (url) and a snapshot of the
    // uploader's avatar at upload time (avatar).
    const fromImages = (arr) => (arr || []).flatMap((img) => [img.url, img.avatar]);
    return [
      ...fromImages(doc.referenceImages),
      ...fromImages(doc.bodyImages),
      ...fromImages(doc.designImages),
    ];
  },
  // Plain URL strings, not [IBImageSchema] - see models/BookingRequest.js's own comment on why
  // (IBImage requires a real userId, which a not-yet-a-client guest booking request doesn't have).
  BookingRequest: (doc) => doc.referenceImages || [],
  Message: (doc) => doc.imageUrls || [],
  FormResponse: (doc) => doc.fileUrls || [],
  // Always a copy of a Message.imageUrls entry, not a second file - see models/SharedImage.js's
  // own comment. Still worth extracting here: dedup happens by URL in the caller, so this just
  // means the same file gets found twice rather than downloaded twice.
  SharedImage: (doc) => [doc.url],
};

// Matches the exact shape utils/firebase-admin.js's getDownloadURL()/the client SDK's own
// getDownloadURL() both produce:
//   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<url-encoded object path>?alt=media&token=<uuid>
// Anything else (empty string, a non-Firebase URL, a malformed one) is reported by the caller as
// skipped rather than guessed at.
const DOWNLOAD_URL_RE = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)\?(.*)$/;

function parseDownloadUrl(url) {
  const match = DOWNLOAD_URL_RE.exec(url);
  if (!match) {
    return null;
  }
  const objectPath = decodeURIComponent(match[1]);
  const token = new URLSearchParams(match[2]).get('token');
  if (!token) {
    return null;
  }
  return { objectPath, token };
}

function extractStorageUrls(collectionName, doc) {
  const extractor = EXTRACTORS[collectionName];
  if (!extractor) {
    return [];
  }
  return extractor(doc).filter((url) => typeof url === 'string' && url.length > 0);
}

module.exports = { extractStorageUrls, parseDownloadUrl };
