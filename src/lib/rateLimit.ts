/**
 * In-memory sliding-window rate limiter.
 *
 * NOTE: On serverless (Vercel), each function instance has its own memory, so
 * this limiter is per-instance, not globally shared across all instances. For
 * strict global rate limiting at scale, back this with Redis/Upstash. For a
 * hackathon / single-region deployment this is sufficient and adds no external
 * dependencies.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

// Hard cap on tracked keys: prevents memory-exhaustion DoS via floods of
// unique (possibly spoofed) keys between eviction sweeps. Oldest-inserted
// keys are evicted first (FIFO approximation of LRU — sufficient here since
// every hit refreshes recency of the bucket's window anyway).
const MAX_BUCKETS = 10_000;

// Evict stale entries every 5 minutes to prevent unbounded memory growth
let lastEviction = Date.now();
const EVICT_INTERVAL_MS = 5 * 60 * 1000;

function evictStale(windowMs: number) {
  const now = Date.now();
  if (now - lastEviction < EVICT_INTERVAL_MS) return;
  lastEviction = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > windowMs * 2) {
      buckets.delete(key);
    }
  }
}

function insertWithCap(key: string, bucket: Bucket) {
  while (buckets.size >= MAX_BUCKETS) {
    // Map preserves insertion order; drop the oldest entry.
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
  buckets.set(key, bucket);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // seconds until window resets
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  evictStale(windowMs);
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    // Refresh position for existing keys too (cheap LRU touch).
    if (bucket) buckets.delete(key);
    insertWithCap(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    const retryAfter = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfter: 0 };
}

/**
 * Extract the best available client identifier from request headers.
 *
 * On Vercel the platform sets `x-vercel-forwarded-for` / appends the real
 * client IP as the LAST entry of `x-forwarded-for`; earlier entries are
 * client-controlled and trivially spoofable. Prefer platform headers, then
 * the rightmost XFF hop; never trust the leftmost value.
 */
export function getClientKey(request: Request): string {
  const realIp =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-vercel-forwarded-for");
  if (realIp && realIp.trim()) return realIp.split(",")[0].trim();

  const fwd = request.headers.get("x-forwarded-for");
  if (fwd && fwd.trim()) {
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]; // rightmost = closest to our proxy
  }
  return "unknown";
}
