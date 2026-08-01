// Fixed-window in-memory rate limiter. Deliberately dependency-free (the sandbox this codebase
// has been developed in can't reach the npm registry to test-install a package like
// express-rate-limit anyway) - a plain Map is enough for a single Render free-tier instance. If
// this service is ever scaled to more than one instance, replace the Map below with a shared
// store (Redis) - each instance would otherwise track its own independent counts, which quietly
// multiplies the effective limit by the instance count.

const buckets = new Map(); // key -> { count, resetAt }

// Sweep expired buckets periodically so this Map can't grow unbounded under sustained traffic.
// Entries are tiny, but these are exactly the public, unauthenticated endpoints scripts target,
// so unbounded growth here is a more realistic concern than on an authenticated resolver.
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, SWEEP_INTERVAL_MS);
// unref so this interval alone can't keep the process alive (relevant for tests/scripts that
// import this module and expect to exit on their own).
if (typeof sweepTimer.unref === 'function') {
  sweepTimer.unref();
}

/**
 * Fixed-window rate limit check. Returns { allowed, retryAfterSeconds }.
 * `key` should already include whatever the caller wants to scope by (e.g.
 * `${ip}:createBookingRequest`) - this function doesn't know or care what the key represents.
 */
function checkRateLimit(key, { windowMs, max }) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (bucket.count >= max) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true };
}

/**
 * Extracts the caller's real IP from behind Render's reverse proxy. Requires
 * `app.set('trust proxy', 1)` in index.js - without it, req.ip returns Render's internal proxy
 * IP for every single request, which would put every caller in the same bucket (rate-limiting
 * all users together after a handful of total requests, not five-per-IP as intended).
 */
function getClientIp(req) {
  return (req && (req.ip || (req.connection && req.connection.remoteAddress))) || 'unknown';
}

module.exports = { checkRateLimit, getClientIp };
