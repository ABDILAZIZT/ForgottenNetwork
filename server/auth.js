const crypto = require('node:crypto');
const session = require('express-session');
const ConnectPgSimple = require('connect-pg-simple');

function sanitizeReturnTo(value) {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !/[\\\x00-\x20]/.test(value)
    ? value
    : '/';
}

function promiseSessionAction(action) {
  return new Promise((resolve, reject) => action((error) => (error ? reject(error) : resolve())));
}

function validateAuthConfiguration(environment, production) {
  if (!production) return;
  if (environment.DISABLE_AUTH_VALIDATION === 'true' || environment.ALLOW_ANONYMOUS_AUTH === 'true') return;
  const oidcFields = ['OIDC_ISSUER_URL', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'];
  const hasAnyOidc = oidcFields.some((name) => Boolean(environment[name]));
  if (!hasAnyOidc) return;
  const required = ['APP_ORIGIN', 'OIDC_ISSUER_URL', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'];
  const missing = required.filter((name) => !environment[name]);
  if (missing.length) {
    throw new Error(`Production authentication is missing: ${missing.join(', ')}`);
  }
  const appOrigin = new URL(environment.APP_ORIGIN);
  if (
    appOrigin.protocol !== 'https:' ||
    appOrigin.origin !== environment.APP_ORIGIN ||
    appOrigin.username ||
    appOrigin.password
  ) {
    throw new Error('APP_ORIGIN must use HTTPS in production');
  }
}

function configureAuthentication(app, { pool }) {
  const production = process.env.NODE_ENV === 'production';
  validateAuthConfiguration(process.env, production);
  const secret =
    process.env.SESSION_SECRET ||
    (production ? '' : 'local-only-session-secret-change-me-32-bytes');
  if (!secret || secret.length < 32)
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  if (production) app.set('trust proxy', 1);

  const sessionOptions = {
    name: 'fn.sid',
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: production,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  };
  if (pool) {
    const PgStore = ConnectPgSimple(session);
    sessionOptions.store = new PgStore({
      pool,
      tableName: 'user_sessions',
      createTableIfMissing: false,
    });
  } else if (production) {
    throw new Error('DATABASE_URL is required for production sessions');
  }
  app.use(session(sessionOptions));

  let developmentUserPromise;
  async function ensureDevelopmentUser() {
    if (!pool) return;
    if (!developmentUserPromise) {
      developmentUserPromise = pool.query(
        `INSERT INTO users (id, auth_provider, auth_subject, display_name)
         VALUES ('00000000-0000-4000-8000-000000000010', 'development', 'local', 'Development Member')
         ON CONFLICT (id) DO NOTHING`,
      );
    }
    await developmentUserPromise;
  }

  app.use(async (req, _res, next) => {
    try {
      const bearer = req.get('authorization') || '';
      if (
        !production &&
        process.env.DEV_AUTH_TOKEN &&
        bearer === `Bearer ${process.env.DEV_AUTH_TOKEN}`
      ) {
        await ensureDevelopmentUser();
        req.actor = {
          id: '00000000-0000-4000-8000-000000000010',
          displayName: 'Development Member',
          avatarUrl: null,
          role: 'member',
          publishingAllowed: true,
        };
        return next();
      }
      if (!req.session?.userId) return next();
      if (!pool) {
        req.actor = req.session.user || null;
        return next();
      }
      const result = await pool.query(
        `SELECT id, display_name, avatar_url, role, publishing_suspended_until
         FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [req.session.userId],
      );
      const user = result.rows[0];
      if (user) {
        req.actor = {
          id: user.id,
          displayName: user.display_name,
          avatarUrl: user.avatar_url,
          role: user.role,
          publishingAllowed:
            !user.publishing_suspended_until ||
            new Date(user.publishing_suspended_until) <= new Date(),
        };
      }
      return next();
    } catch (error) {
      return next(error);
    }
  });

  let oidcConfigurationPromise;
  async function getOidc() {
    if (
      !process.env.OIDC_ISSUER_URL ||
      !process.env.OIDC_CLIENT_ID ||
      !process.env.OIDC_CLIENT_SECRET
    ) {
      return null;
    }
    const oidc = await import('openid-client');
    if (!oidcConfigurationPromise) {
      oidcConfigurationPromise = oidc
        .discovery(
          new URL(process.env.OIDC_ISSUER_URL),
          process.env.OIDC_CLIENT_ID,
          process.env.OIDC_CLIENT_SECRET,
        )
        .catch((error) => {
          oidcConfigurationPromise = undefined;
          throw error;
        });
    }
    return { oidc, configuration: await oidcConfigurationPromise };
  }

  app.get('/api/v1/auth/config', async (_req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json({
        enabled: Boolean(
          process.env.OIDC_ISSUER_URL &&
          process.env.OIDC_CLIENT_ID &&
          process.env.OIDC_CLIENT_SECRET &&
          process.env.APP_ORIGIN,
        ),
        moderation: Boolean(pool),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/auth/login', async (req, res, next) => {
    try {
      const client = await getOidc();
      if (!client)
        return res
          .status(503)
          .json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'Sign-in is not configured.' } });
      const verifier = client.oidc.randomPKCECodeVerifier();
      const challenge = await client.oidc.calculatePKCECodeChallenge(verifier);
      const state = client.oidc.randomState();
      req.session.oidc = {
        verifier,
        state,
        createdAt: Date.now(),
        returnTo: sanitizeReturnTo(req.query.returnTo),
      };
      await promiseSessionAction((done) => req.session.save(done));
      const redirectUri = new URL('/api/v1/auth/callback', process.env.APP_ORIGIN).toString();
      const url = client.oidc.buildAuthorizationUrl(client.configuration, {
        redirect_uri: redirectUri,
        scope: 'openid profile email',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
      });
      return res.redirect(url.toString());
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/auth/callback', async (req, res, next) => {
    try {
      const client = await getOidc();
      const pending = req.session.oidc;
      if (!client || !pending || Date.now() - pending.createdAt > 10 * 60 * 1000)
        return res.status(400).send('Authentication session expired.');
      delete req.session.oidc;
      await promiseSessionAction((done) => req.session.save(done));
      const currentUrl = new URL(req.originalUrl, process.env.APP_ORIGIN);
      const tokens = await client.oidc.authorizationCodeGrant(client.configuration, currentUrl, {
        pkceCodeVerifier: pending.verifier,
        expectedState: pending.state,
      });
      const claims = tokens.claims();
      if (!claims?.sub || !pool)
        throw new Error('The identity provider returned no subject or database is unavailable');
      const displayName = String(
        claims.name || claims.preferred_username || claims.email || 'Member',
      ).slice(0, 60);
      const issuer = new URL(process.env.OIDC_ISSUER_URL).toString().replace(/\/$/, '');
      const result = await pool.query(
        `INSERT INTO users (id, auth_provider, auth_subject, display_name, avatar_url)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (auth_provider, auth_subject)
         DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url
         RETURNING id, display_name, avatar_url, role`,
        [crypto.randomUUID(), issuer, claims.sub, displayName, claims.picture || null],
      );
      const user = result.rows[0];
      const returnTo = pending.returnTo;
      await promiseSessionAction((done) => req.session.regenerate(done));
      req.session.userId = user.id;
      await promiseSessionAction((done) => req.session.save(done));
      return res.redirect(returnTo);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/v1/auth/logout', async (req, res, next) => {
    try {
      await promiseSessionAction((done) => req.session.destroy(done));
      res.clearCookie('fn.sid', { httpOnly: true, secure: production, sameSite: 'lax', path: '/' });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { configureAuthentication, sanitizeReturnTo, validateAuthConfiguration };
