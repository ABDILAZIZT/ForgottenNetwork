const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { configureAuthentication } = require('./auth');
const { createDatabasePool } = require('./database');
const { createPostgresWorldApi } = require('./postgresWorldApi');
const { runMigrations } = require('./migrate');
const { serveFrontend } = require('./frontend');
const {
  securityHeaders,
  originProtection,
  rateLimit,
  publishingIdentityProtection,
} = require('./security');
const { createObjectStorage } = require('./objectStorage');
const { createInitialSharedWorld, createWorldApi, normalizeSharedWorld } = require('./worldApi');
const { createPermanentCanvas } = require('./permanent/api');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const DB_PATH = path.resolve(__dirname, process.env.DB_PATH || 'db.json');
const allowedOrigins = [
  ...new Set(
    (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .concat(process.env.APP_ORIGIN ? [process.env.APP_ORIGIN] : [])
      .map((origin) => origin.trim())
      .filter(Boolean),
  ),
];
const databasePool = createDatabasePool();

app.disable('x-powered-by');
securityHeaders(app);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use('/api', originProtection(allowedOrigins));
const ipLimiter = rateLimit({ pool: databasePool, scope: 'ip', limit: 600 });
app.use('/api', (req, res, next) =>
  req.path.startsWith('/v1/health/') || req.path === '/health' ? next() : ipLimiter(req, res, next),
);
app.use(express.json({ limit: '12mb' }));
configureAuthentication(app, { pool: databasePool });
const permanentCanvas = createPermanentCanvas({ origins: allowedOrigins });
app.use('/api/canvas', permanentCanvas.router);
app.use('/api', publishingIdentityProtection);
const memberLimiter = rateLimit({
  pool: databasePool,
  scope: 'member-write',
  limit: 120,
  key: (req) => req.actor?.id,
});
app.use('/api', (req, res, next) =>
  ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : memberLimiter(req, res, next),
);

const DEFAULT_SPRITE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA0SURBVDhPY3jPQAJgNCwHDAZGBoIBEAMwKQRpgKEB+AwkNMDQAHwGEhpgbAA+AwkNwPQ/AADIxg7hz85x2gAAAABJRU5ErkJggg==';

const WORLD_TILE = 100;

function normalizeDb(raw) {
  const db = raw && typeof raw === 'object' ? raw : {};
  if (!Array.isArray(db.creatures)) db.creatures = [];
  if (!Array.isArray(db.structures)) db.structures = [];
  db.sharedWorld = normalizeSharedWorld(db.sharedWorld);
  return db;
}

// Ensure DB exists
if (!databasePool && !fs.existsSync(DB_PATH)) {
  fs.writeFileSync(
    DB_PATH,
    JSON.stringify(
      {
        creatures: [
          {
            id: '0',
            name: 'The First One',
            author: 'System',
            description: 'The ancient entity that birthed the terrarium.',
            sprite: DEFAULT_SPRITE,
            width: 16,
            height: 16,
            x: 0,
            y: 0,
            timestamp: new Date().toISOString(),
          },
        ],
        structures: [],
        sharedWorld: createInitialSharedWorld(),
      },
      null,
      2,
    ),
    'utf-8',
  );
}

const getDB = () => normalizeDb(JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')));
const saveDB = (data) =>
  (() => {
    const temporaryPath = `${DB_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(normalizeDb(data), null, 2), 'utf-8');
    fs.renameSync(temporaryPath, DB_PATH);
  })();

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function snapWorld(v) {
  return Math.round(v / WORLD_TILE) * WORLD_TILE;
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(
  '/api/v1',
  databasePool
    ? createPostgresWorldApi({ pool: databasePool, objectStorage: createObjectStorage() })
    : createWorldApi({ getDB, saveDB }),
);

app.use(['/api/creatures', '/api/structures'], (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Legacy API is disabled' });
  }
  return next();
});

app.get('/api/creatures', (req, res) => {
  try {
    const db = getDB();
    res.json(db.creatures);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read database' });
  }
});

app.get('/api/structures', (req, res) => {
  try {
    const db = getDB();
    res.json(db.structures);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read database' });
  }
});

app.post('/api/creatures', (req, res) => {
  try {
    const { name, author, description, sprite, width, height, limbRegions, displayScale } =
      req.body;

    if (!sprite) {
      return res.status(400).json({ error: 'Sprite data is required' });
    }

    const db = getDB();
    const newCreature = {
      id: Date.now().toString(),
      name: name || 'Unknown Entity',
      author: author || 'Anonymous',
      description: description || 'A mysterious resident of the digital world.',
      sprite,
      width: width || 32,
      height: height || 32,
      x: Math.random() * 2000 - 1000,
      y: Math.random() * 1000 - 500,
      timestamp: new Date().toISOString(),
      limbRegions: limbRegions || undefined,
      displayScale: typeof displayScale === 'number' ? displayScale : undefined,
    };

    db.creatures.push(newCreature);
    saveDB(db);

    res.status(201).json(newCreature);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save creature' });
  }
});

app.post('/api/structures', (req, res) => {
  try {
    const db = getDB();
    const body = req.body || {};

    // Batch support
    if (body.batch && Array.isArray(body.batch)) {
      if (body.batch.length === 0 || body.batch.length > 100) {
        return res.status(400).json({ error: 'Batch must contain between 1 and 100 structures' });
      }
      if (
        body.batch.some(
          (item) => !item?.sprite || !isFiniteNumber(item.x) || !isFiniteNumber(item.y),
        )
      ) {
        return res.status(400).json({ error: 'Every structure requires sprite, x, and y values' });
      }
      const created = body.batch.map((item, i) => ({
        id: `${Date.now()}-${i}`,
        name: item.name || 'Structure',
        author: item.author || 'Anonymous',
        description: item.description || 'A permanent imprint on the terrarium.',
        sprite: item.sprite,
        width: item.width || 32,
        height: item.height || 32,
        x: item.x,
        y: item.y,
        structureKind: item.structureKind || 'prop',
        worldScale: typeof item.worldScale === 'number' ? item.worldScale : 3,
        timestamp: new Date().toISOString(),
      }));
      db.structures.push(...created);
      saveDB(db);
      return res.status(201).json({ batch: created });
    }

    const {
      name,
      author,
      description,
      sprite,
      width,
      height,
      structureKind,
      worldScale,
      clusterCount,
      snapToGrid,
      x,
      y,
      explicitPlacement,
    } = body;

    if (!sprite) {
      return res.status(400).json({ error: 'Sprite data is required' });
    }

    const snap = snapToGrid !== false;

    if (explicitPlacement === true && typeof x === 'number' && typeof y === 'number') {
      const sx = snap ? snapWorld(x) : x;
      const sy = snap ? snapWorld(y) : y;
      const row = {
        id: `${Date.now()}-0`,
        name: name || 'Structure',
        author: author || 'Anonymous',
        description: description || 'A permanent imprint on the terrarium.',
        sprite,
        width: width || 32,
        height: height || 32,
        x: sx,
        y: sy,
        structureKind: structureKind || 'prop',
        worldScale: typeof worldScale === 'number' ? worldScale : 3,
        timestamp: new Date().toISOString(),
      };
      db.structures.push(row);
      saveDB(db);
      return res.status(201).json(row);
    }

    const count = Math.min(12, Math.max(1, parseInt(clusterCount, 10) || 1));
    const baseX = snap ? snapWorld(Math.random() * 2000 - 1000) : Math.random() * 2000 - 1000;
    const baseY = snap ? snapWorld(Math.random() * 1000 - 500) : Math.random() * 1000 - 500;
    const created = [];

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
      const radius = 70 + Math.random() * 90;
      const rawX = baseX + Math.cos(angle) * radius;
      const rawY = baseY + Math.sin(angle) * radius * 0.75;
      const sx = snap ? snapWorld(rawX) : rawX;
      const sy = snap ? snapWorld(rawY) : rawY;

      const row = {
        id: `${Date.now()}-${i}`,
        name: name || 'Structure',
        author: author || 'Anonymous',
        description: description || 'A permanent imprint on the terrarium.',
        sprite,
        width: width || 32,
        height: height || 32,
        x: sx,
        y: sy,
        structureKind: structureKind || 'prop',
        worldScale: typeof worldScale === 'number' ? worldScale : 3,
        timestamp: new Date().toISOString(),
      };
      db.structures.push(row);
      created.push(row);
    }

    saveDB(db);
    res.status(201).json(created.length === 1 ? created[0] : { structures: created });
  } catch (error) {
    console.error('Save failed:', error);
    res.status(500).json({ error: 'Failed to save structure' });
  }
});

if (process.env.NODE_ENV === 'production' || process.env.SERVE_FRONTEND === 'true') {
  serveFrontend(app, path.join(__dirname, '../client/dist'));
}

app.use((error, _req, res, _next) => {
  if (error.type === 'entity.too.large')
    return res
      .status(413)
      .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request exceeds 12 MB.' } });
  if (error instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid JSON request body' });
  }
  console.error(
    JSON.stringify({
      event: 'server_error',
      requestId: res.locals.requestId,
      code: error.code || 'INTERNAL_ERROR',
    }),
  );
  return res.status(500).json({ error: 'Internal server error' });
});

async function startServer() {
  if (databasePool && process.env.MIGRATE_ON_START === 'true') {
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        await runMigrations(databasePool);
        break;
      } catch (err) {
        console.warn(`Migration attempt ${attempt}/10 failed (${err.message}). Retrying in 3s...`);
        if (attempt === 10) throw err;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }
  const server = app.listen(PORT, () => {
    console.log(`Cyber Terrarium Backend running on http://localhost:${PORT}`);
  });
  server.requestTimeout = 30000;
  const closePermanentCanvas = permanentCanvas.attach(server);
  server.headersTimeout = 10000;
  const maintenance =
    databasePool &&
    setInterval(() => {
      void databasePool
        .query('DELETE FROM request_limits WHERE expires_at < now()')
        .catch(() => undefined);
    }, 60000);
  if (maintenance) maintenance.unref();
  const shutdown = () => {
    closePermanentCanvas();
    server.close(async () => {
      if (databasePool) await databasePool.end();
      process.exit(0);
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Server startup failed:', error);
    process.exitCode = 1;
  });
}

module.exports = { app, databasePool, normalizeDb, snapWorld, startServer };
