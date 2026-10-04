const crypto = require('node:crypto');
const helmet = require('helmet');

function securityHeaders(app) {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      xFrameOptions: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.use((req, res, next) => {
    const requestId = crypto.randomUUID();
    res.locals.requestId = requestId;
    res.set('X-Request-Id', requestId);
    const started = Date.now();
    res.on('finish', () => {
      if (process.env.REQUEST_LOGS === 'true')
        console.log(
          JSON.stringify({
            event: 'request',
            requestId,
            method: req.method,
            status: res.statusCode,
            durationMs: Date.now() - started,
          }),
        );
    });
    next();
  });
}

function originProtection(origins) {
  const allowed = new Set(origins);
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (
      (origin && !allowed.has(origin)) ||
      req.get('sec-fetch-site') === 'cross-site' ||
      (req.headers.cookie && !origin)
    ) {
      return res
        .status(403)
        .json({ error: { code: 'FORBIDDEN', message: 'Request origin is not allowed.' } });
    }
    next();
  };
}

// Fixed-window counters are shared across production processes through PostgreSQL.
function rateLimit({ pool, scope, limit, windowMs = 60000, key = (req) => req.ip }) {
  const counters = new Map();
  return async (req, res, next) => {
    try {
      const identity = key(req);
      if (!identity) return next();
      const window = Math.floor(Date.now() / windowMs);
      const bucket = crypto
        .createHash('sha256')
        .update(`${scope}:${identity}:${window}`)
        .digest('hex');
      let count;
      if (pool) {
        const result = await pool.query(
          `INSERT INTO request_limits (bucket, count, expires_at)
          VALUES ($1, 1, $2) ON CONFLICT (bucket) DO UPDATE SET count = request_limits.count + 1
          RETURNING count`,
          [bucket, new Date((window + 1) * windowMs)],
        );
        count = Number(result.rows[0].count);
      } else {
        for (const [id, value] of counters) if (value.window !== window) counters.delete(id);
        if (counters.size > 10000 && !counters.has(bucket))
          return res
            .status(503)
            .json({ error: { code: 'BUSY', message: 'Please retry shortly.' } });
        count = (counters.get(bucket)?.count || 0) + 1;
        counters.set(bucket, { count, window });
      }
      if (count > limit) {
        res.set(
          'Retry-After',
          String(Math.max(1, Math.ceil(((window + 1) * windowMs - Date.now()) / 1000))),
        );
        return res.status(429).json({
          error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait and retry.' },
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

function publishingIdentityProtection(req, res, next) {
  const expected = req.get('X-Publishing-Actor');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && expected && expected !== req.actor?.id)
    return res.status(401).json({
      error: {
        code: 'IDENTITY_REQUIRED',
        message:
          'The signed-in account changed. Reload and sign in with the account that created these edits.',
      },
    });
  next();
}
module.exports = { securityHeaders, originProtection, rateLimit, publishingIdentityProtection };
