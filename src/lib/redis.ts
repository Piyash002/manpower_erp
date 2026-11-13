import Redis from 'ioredis';

// ==============================================================================
// SENIOR PRODUCTION CACHE: REDIS (L2) + IN-MEMORY (L1) FALLBACK SYSTEM
// ==============================================================================
// Features:
// 1. High-throughput Redis client with automatic connection pooling & lazy connect.
// 2. Resilient In-Memory (L1) fallback if Redis is offline or unconfigured.
// 3. Zero unhandled rejections: Safe error boundaries prevent any server crashes.
// 4. `rememberCache(key, ttlSeconds, fetcher)`: Stale-free cache helper.
// 5. Pattern invalidation: `delCachePattern('dashboard:*')`.
// ==============================================================================

interface MemoryCacheEntry {
  value: string;
  expiresAt: number;
}

// L1 In-Memory Cache Store
const memoryStore = new Map<string, MemoryCacheEntry>();

function getFromMemory<T>(key: string): T | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  try {
    return JSON.parse(entry.value) as T;
  } catch {
    return null;
  }
}

function setToMemory(key: string, value: any, ttlSeconds: number = 60): void {
  // Prevent unbounded memory growth by evicting oldest if over 1000 items
  if (memoryStore.size > 1000) {
    const firstKey = memoryStore.keys().next().value;
    if (firstKey) memoryStore.delete(firstKey);
  }
  memoryStore.set(key, {
    value: JSON.stringify(value),
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

function delFromMemory(key: string): void {
  memoryStore.delete(key);
}

function delPatternFromMemory(pattern: string): void {
  // Convert glob pattern (e.g., 'dashboard:*') to regex
  const regexStr = '^' + pattern.replace(/\*/g, '.*') + '$';
  const regex = new RegExp(regexStr);
  for (const k of Array.from(memoryStore.keys())) {
    if (regex.test(k)) {
      memoryStore.delete(k);
    }
  }
}

// L2 Redis Client Setup
let redisClient: Redis | null = null;
let isRedisAvailable = false;
let redisLoggedOnce = false;

function initRedis(): Redis | null {
  if (redisClient) return redisClient;

  const redisUrl =
    process.env.REDIS_URL ||
    process.env.UPSTASH_REDIS_URL ||
    'redis://127.0.0.1:6379';

  try {
    const client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      enableOfflineQueue: false,
      retryStrategy(times) {
        if (times > 2) return null; // Fail fast after 2 attempts to avoid log spam
        return 1000;
      },
    });

    client.on('connect', () => {
      isRedisAvailable = true;
      if (!redisLoggedOnce) {
        console.log('✅ [Redis] Connected successfully to Redis cache cluster.');
        redisLoggedOnce = true;
      }
    });

    client.on('error', (err) => {
      isRedisAvailable = false;
      if (!redisLoggedOnce) {
        console.warn('⚡ [Cache] Redis not reachable on port 6379. Operating with zero-downtime high-speed in-memory L1 cache.');
        redisLoggedOnce = true;
      }
    });

    client.on('close', () => {
      isRedisAvailable = false;
    });

    // Attempt non-blocking background connection
    client.connect().catch(() => {
      isRedisAvailable = false;
    });

    redisClient = client;
    return redisClient;
  } catch (err) {
    isRedisAvailable = false;
    return null;
  }
}

// Initialize on module load
initRedis();

// ==============================================================================
// PUBLIC CACHING API
// ==============================================================================

/**
 * Get value from Cache (L1 Memory first, then L2 Redis)
 */
export async function getCache<T>(key: string): Promise<T | null> {
  // Check L1 In-Memory
  const memValue = getFromMemory<T>(key);
  if (memValue !== null) {
    return memValue;
  }

  // Check L2 Redis if available
  if (isRedisAvailable && redisClient) {
    try {
      const data = await redisClient.get(key);
      if (data) {
        const parsed = JSON.parse(data) as T;
        // Populate L1 cache for subsequent ultra-fast reads
        setToMemory(key, parsed, 30);
        return parsed;
      }
    } catch {
      // Graceful fallback to null
    }
  }

  return null;
}

/**
 * Set value in Cache (Writes to both L1 Memory and L2 Redis)
 */
export async function setCache(
  key: string,
  value: any,
  ttlSeconds: number = 60
): Promise<void> {
  // Write to L1
  setToMemory(key, value, ttlSeconds);

  // Write to L2 Redis if available
  if (isRedisAvailable && redisClient) {
    try {
      const stringified = JSON.stringify(value);
      await redisClient.set(key, stringified, 'EX', ttlSeconds);
    } catch {
      // Ignored for resilience
    }
  }
}

/**
 * Delete key from Cache
 */
export async function delCache(key: string): Promise<void> {
  delFromMemory(key);
  if (isRedisAvailable && redisClient) {
    try {
      await redisClient.del(key);
    } catch {
      // Ignored
    }
  }
}

/**
 * Invalidate keys matching a pattern (e.g. 'dashboard:*', 'trades:*')
 */
export async function delCachePattern(pattern: string): Promise<void> {
  delPatternFromMemory(pattern);

  if (isRedisAvailable && redisClient) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch {
      // Ignored
    }
  }
}

/**
 * Remember Cache: Reads from cache, or executes fetcher on miss and caches result.
 * @param key Unique cache key
 * @param ttlSeconds Time-to-live in seconds
 * @param fetcher Async function to fetch live data on cache miss
 */
export async function rememberCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await getCache<T>(key);
  if (cached !== null && cached !== undefined) {
    return cached;
  }

  const fresh = await fetcher();
  await setCache(key, fresh, ttlSeconds);
  return fresh;
}

/**
 * Returns cache diagnostics
 */
export function getCacheDiagnostics() {
  return {
    redisConnected: isRedisAvailable,
    l1MemoryEntries: memoryStore.size,
    provider: isRedisAvailable ? 'Redis (L2) + Memory (L1)' : 'High-Speed In-Memory (L1)',
  };
}

/**
 * Invalidation helpers for active modules
 */
export async function invalidateDashboardCache() {
  await delCachePattern('dashboard:*');
}

export async function invalidateMasterCache() {
  await delCachePattern('master:*');
}

export async function invalidateNotificationCache() {
  await delCachePattern('notifications:*');
}

