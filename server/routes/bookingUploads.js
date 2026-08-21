const express = require('express');
const multer = require('multer');
const { checkRateLimit, getClientIp } = require('../utils/rate-limit');
const { uploadGuestReferenceImage } = require('../utils/firebase-admin');
const { reportError } = require('../utils/error-reporting');

const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB per file

// Only ever trust the file's actual mimetype (as reported by multer/the request's Content-Type
// per part) to pick a canonical extension - never the client-supplied original filename, which
// is attacker-controlled and never touches Storage; the object we write is always
// booking-uploads/<random-uuid><this-extension>.
const MIME_TO_EXTENSION = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILES,
  },
  fileFilter(req, file, cb) {
    if (!MIME_TO_EXTENSION[file.mimetype]) {
      cb(new Error('UNSUPPORTED_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});

const router = express.Router();

// Public, unauthenticated by design - same threat model as createBookingRequest/sendGuestMessage
// (see utils/rate-limit.js): a prospective client hasn't got an account yet when they're
// attaching reference images to their very first submission, so there's nothing to authenticate
// against. This is a plain Express route, not a GraphQL mutation, because multipart file bodies
// don't fit through GraphQL's JSON transport without an extra spec (graphql-multipart-request)
// this app doesn't otherwise need.
//
// Rate-limited separately from the GraphQL mutations since this is a different endpoint - 10
// upload *requests* per hour per IP; since each request can carry up to MAX_FILES files, that's
// an effective ceiling of 50 images/hour/IP, not 10.
router.post(
  '/booking-uploads',
  (req, res, next) => {
    const ip = getClientIp(req);
    const { allowed, retryAfterSeconds } = checkRateLimit(`${ip}:bookingUploads`, {
      windowMs: 60 * 60 * 1000,
      max: 10,
    });
    if (!allowed) {
      res
        .status(429)
        .json({ error: `Too many uploads from this address. Try again in ${retryAfterSeconds} seconds.` });
      return;
    }
    next();
  },
  (req, res) => {
    upload.array('files', MAX_FILES)(req, res, async (err) => {
      if (err) {
        let message = 'Upload failed.';
        if (err.message === 'UNSUPPORTED_FILE_TYPE') {
          message = 'Only JPEG, PNG, WEBP, and GIF images are allowed.';
        } else if (err.code === 'LIMIT_FILE_SIZE') {
          message = `Each image must be under ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`;
        } else if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          message = `You can upload at most ${MAX_FILES} images.`;
        }
        res.status(400).json({ error: message });
        return;
      }

      if (!req.files || req.files.length === 0) {
        res.status(400).json({ error: 'No files were uploaded.' });
        return;
      }

      try {
        const urls = await Promise.all(
          req.files.map((file) =>
            uploadGuestReferenceImage(file.buffer, { extension: MIME_TO_EXTENSION[file.mimetype] }),
          ),
        );
        if (urls.some((url) => url === null)) {
          res.status(503).json({ error: 'Image uploads are temporarily unavailable.' });
          return;
        }
        res.json({ urls });
      } catch (uploadErr) {
        reportError(uploadErr, { context: '[booking-uploads] Failed to upload to Firebase Storage' });
        res.status(500).json({ error: 'Upload failed.' });
      }
    });
  },
);

module.exports = router;
