const express = require('express');
const multer = require('multer');
const checkAuth = require('../utils/check-auth');
const { checkRateLimit, getClientIp } = require('../utils/rate-limit');
const { uploadMessageAttachment } = require('../utils/firebase-admin');

// Mirrors routes/formUploads.js almost exactly - same Storage mechanism (uploadMessageAttachment,
// a thin folder-scoped wrapper around the same uploadPublicFile that backs
// uploadFormSubmissionFile/uploadGuestReferenceImage - see utils/firebase-admin.js), same
// multer/rate-limit/allowlist shape. Its own route rather than a `folder` param on an existing
// one, for the same reason formUploads.js gives: an incident on one upload kind shouldn't throttle
// or rate-limit-share with an unrelated one.
//
// The one real difference from formUploads.js: AUTHENTICATED, not public. There is no guest path
// into the Messenger the way there is into a public form or a booking-intake link - every real
// caller of createMessage is already a logged-in member of the conversation - so this route checks
// a real JWT via checkAuth() rather than being open like the other two. Same reasoning as
// routes/squarePayments.js's own use of checkAuth() for a plain (non-GraphQL) route.
//
// Same "an uploaded-but-never-attached file is not a privacy leak" reasoning as formUploads.js
// applies here too: the URL only means anything once it's actually on a Message, which
// createMessage authorizes for real (conversation membership - see mutations/messages.js).

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

router.post(
  '/message-uploads',
  (req, res, next) => {
    try {
      // Thrown, not returned - checkAuth's contract is "throws on anything wrong with the token"
      // (missing, expired, malformed). Not attached to req.user; this route has no further use for
      // the decoded payload beyond having confirmed one exists, unlike squarePayments.js which
      // reads user.id back out afterward.
      checkAuth({ req });
    } catch (err) {
      res.status(401).json({ error: err.message });
      return;
    }
    next();
  },
  (req, res, next) => {
    const ip = getClientIp(req);
    const { allowed, retryAfterSeconds } = checkRateLimit(`${ip}:messageUploads`, {
      windowMs: 60 * 60 * 1000,
      max: 30,
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
          message = `You can attach at most ${MAX_FILES} images per message.`;
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
            uploadMessageAttachment(file.buffer, { extension: MIME_TO_EXTENSION[file.mimetype] }),
          ),
        );
        if (urls.some((url) => url === null)) {
          res.status(503).json({ error: 'Image uploads are temporarily unavailable.' });
          return;
        }
        res.json({ urls });
      } catch (uploadErr) {
        console.error('[message-uploads] Failed to upload to Firebase Storage:', uploadErr.message);
        res.status(500).json({ error: 'Upload failed.' });
      }
    });
  },
);

module.exports = router;
