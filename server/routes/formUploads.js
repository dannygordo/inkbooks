const express = require('express');
const multer = require('multer');
const { checkRateLimit, getClientIp } = require('../utils/rate-limit');
const { uploadFormSubmissionFile } = require('../utils/firebase-admin');
const { reportError } = require('../utils/error-reporting');

// Mirrors routes/bookingUploads.js almost exactly - same Storage mechanism
// (uploadFormSubmissionFile, a thin folder-scoped wrapper around the same uploadPublicFile that
// backs uploadGuestReferenceImage - see utils/firebase-admin.js), same multer/rate-limit shape.
// Kept as its own route rather than a `folder` query param on /booking-uploads: two independent
// features (booking intake vs. a form's file-upload field) sharing one endpoint would couple their
// rate limits and size/count ceilings together for no real benefit, and a form-uploads incident
// (e.g. abuse of a public form's link) shouldn't throttle booking-request photo uploads or vice
// versa.

const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB per file

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

// Public, unauthenticated by design - a guest filling out a form via its public link (see
// models/Form.js's allowGuestSubmissions) hasn't necessarily got an account, the same reasoning
// /booking-uploads is public. An AUTHENTICATED caller (staff filling out a form's file-upload
// field on a client's behalf) uses this same endpoint too, rather than a second authenticated-only
// route - the file itself carries no owner/permission implications until it's actually attached to
// a FormResponse via submitFormResponse, which IS authorization-checked (see
// resolvers/forms.js) - an uploaded-but-never-submitted file sitting in Storage is not a privacy
// leak of anything.
router.post(
  '/form-uploads',
  (req, res, next) => {
    const ip = getClientIp(req);
    const { allowed, retryAfterSeconds } = checkRateLimit(`${ip}:formUploads`, {
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
          message = `Each file must be under ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`;
        } else if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          message = `You can upload at most ${MAX_FILES} files.`;
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
            uploadFormSubmissionFile(file.buffer, { extension: MIME_TO_EXTENSION[file.mimetype] }),
          ),
        );
        if (urls.some((url) => url === null)) {
          res.status(503).json({ error: 'File uploads are temporarily unavailable.' });
          return;
        }
        res.json({ urls });
      } catch (uploadErr) {
        reportError(uploadErr, { context: '[form-uploads] Failed to upload to Firebase Storage' });
        res.status(500).json({ error: 'Upload failed.' });
      }
    });
  },
);

module.exports = router;
