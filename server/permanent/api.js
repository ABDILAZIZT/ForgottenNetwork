const express = require('express');
const sharp = require('sharp');
const { WebSocketServer, WebSocket } = require('ws');
const { CanvasStore, normalizeElement, fail } = require('./store');
const path = require('node:path');

function createPermanentCanvas({ filename, origins = [], pool } = {}) {
  let store;
  const get = () =>
    store ||
    (store = new CanvasStore(
      filename ||
        process.env.PERMANENT_DB_PATH ||
        (process.env.DB_PATH
          ? path.resolve(__dirname, '..', process.env.DB_PATH) + '.canvas.sqlite'
          : path.join(__dirname, '../data/permanent.sqlite')),
    ));
  const router = express.Router(),
    peers = new Set(),
    limits = new Map();
  let statsCache = null;
  function limit(key, max, windowMs = 1000) {
    const window = Math.floor(Date.now() / windowMs),
      old = limits.get(key);
    if (!old || old.window !== window) limits.set(key, { window, count: 1 });
    else if (++old.count > max) throw fail('Slow down for a moment, then try again.', 429);
    if (limits.size > 10000)
      for (const [k, v] of limits) if (v.window < window - 2) limits.delete(k);
  }
  const auth = (req) => {
    const user = get().authenticate((req.get('authorization') || '').replace(/^Bearer /, ''));
    if (!user) throw fail('Restore your identity or choose a name to create.', 401);
    return user;
  };
  const route = (handler) => async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
  const send = (peer, type, data) => {
    if (peer.ws.readyState === WebSocket.OPEN && peer.ws.bufferedAmount < 2 * 1024 * 1024)
      peer.ws.send(JSON.stringify({ type, data }));
  };
  const broadcast = (type, data, test = () => true) => {
    for (const peer of peers) if (test(peer)) send(peer, type, data);
  };
  const presence = () =>
    [...peers]
      .filter((p) => p.ready)
      .map((p) => ({
        connectionId: p.id,
        id: p.user?.id || p.id,
        name: p.user?.name || 'Explorer',
        color: p.user?.color || '#94a3b8',
        avatarId: p.user?.avatarId,
        x: p.x || 0,
        y: p.y || 0,
        drawing: Boolean(p.drawing),
        authenticated: Boolean(p.user),
        view: p.view,
      }));
  const sendPresence = () => broadcast('presence', presence());
  const intersects = (peer, e) =>
    !peer.view ||
    (e.x < peer.view.x + peer.view.width &&
      e.x + e.width > peer.view.x &&
      e.y < peer.view.y + peer.view.height &&
      e.y + e.height > peer.view.y);

  router.post(
    '/classic-session',
    route(async (req, res) => {
      const user = auth(req);
      limit('classic-session:' + user.id, 5, 60000);
      if (!req.session) throw fail('Classic sessions are unavailable.', 503);
      if (pool) {
        await pool.query(
          "INSERT INTO users(id,auth_provider,auth_subject,display_name) VALUES($1,'canvas',$1,$2) ON CONFLICT(id) DO NOTHING",
          [user.id, user.name],
        );
        const result = await pool.query(
          'SELECT auth_provider,deleted_at,publishing_suspended_until FROM users WHERE id=$1',
          [user.id],
        );
        const account = result.rows[0];
        if (
          !account ||
          account.auth_provider !== 'canvas' ||
          account.deleted_at ||
          (account.publishing_suspended_until &&
            new Date(account.publishing_suspended_until) > new Date())
        )
          throw fail('This Classic account cannot publish.', 403);
      }
      await new Promise((resolve, reject) =>
        req.session.regenerate((error) => (error ? reject(error) : resolve())),
      );
      req.session.userId = user.id;
      req.session.user = {
        id: user.id,
        displayName: user.name,
        avatarUrl: null,
        role: 'member',
        publishingAllowed: true,
      };
      await new Promise((resolve, reject) =>
        req.session.save((error) => (error ? reject(error) : resolve())),
      );
      res.json({ ready: true });
    }),
  );
  router.get(
    '/health',
    route((_req, res) => {
      get().db.prepare('SELECT 1').get();
      res.json({ ready: true, storage: 'sqlite', permanent: true });
    }),
  );
  router.post(
    '/identity',
    route((req, res) => {
      limit('register:' + req.ip, 5, 60000);
      res.status(201).json(get().register(req.body));
    }),
  );
  router.get(
    '/me',
    route((req, res) => res.json(get().visit(auth(req).id))),
  );
  router.get(
    '/stats',
    route((_req, res) => {
      if (!statsCache || Date.now() - statsCache.at > 2000)
        statsCache = { at: Date.now(), value: get().stats() };
      res.json({ ...statsCache.value, online: presence().length });
    }),
  );
  router.get(
    '/elements',
    route((req, res) => {
      const bounds = {};
      for (const key of ['x', 'y', 'width', 'height', 'after'])
        if (req.query[key] !== undefined) bounds[key] = Number(req.query[key]);
      res.json(get().load(bounds));
    }),
  );
  router.get(
    '/free-space',
    route((req, res) => {
      const values = ['x', 'y', 'width', 'height'].map((key, i) =>
        Number(req.query[key] ?? [0, 0, 160, 120][i]),
      );
      if (!values.every(Number.isFinite)) throw fail('Invalid location.');
      res.json(get().findFree(...values));
    }),
  );
  router.get(
    '/elements/:id',
    route((req, res) => {
      const element = get().element(req.params.id);
      if (!element) throw fail('Artwork not found.', 404);
      res.json({ ...element, reactions: get().reactions(element.id) });
    }),
  );
  router.post(
    '/elements',
    route((req, res) => {
      const user = auth(req);
      limit('place:' + user.id, 10);
      const result = get().place(req.body, user);
      if (!result.duplicate) {
        statsCache = null;
        broadcast('element:place', result.element, (p) => intersects(p, result.element));
      }
      res.status(result.duplicate ? 200 : 201).json({ ...result, profile: get().profile(user.id) });
    }),
  );
  router.get(
    '/my-artworks',
    route((req, res) => {
      const user = auth(req);
      res.json({
        elements: get()
          .db.prepare('SELECT * FROM canvas_active WHERE owner_id=? ORDER BY seq DESC LIMIT 400')
          .all(user.id)
          .map((r) => get().row(r)),
        removed: get()
          .db.prepare(
            'SELECT element_id AS id,removed_at AS removedAt FROM canvas_removed WHERE actor_id=? ORDER BY removed_at DESC LIMIT 100',
          )
          .all(user.id),
      });
    }),
  );
  router.post(
    '/elements/:id/restore',
    route((req, res) => {
      const user = auth(req);
      limit('restore:' + user.id, 10, 60000);
      const art = get().restore(req.params.id, user);
      statsCache = null;
      broadcast('element:restore', art);
      res.json(art);
    }),
  );
  router.post(
    '/elements/remove',
    route((req, res) => {
      const user = auth(req);
      limit('remove:' + user.id, 10, 60000);
      const result = get().remove(req.body, user);
      statsCache = null;
      broadcast('elements:remove', result);
      res.json(result);
    }),
  );
  router.post(
    '/assets',
    route(async (req, res) => {
      const user = auth(req);
      limit('upload:' + user.id, 12, 60000);
      if (typeof req.body.data !== 'string' || req.body.data.length > 11200000)
        throw fail('Choose an image under 8MB.');
      const bytes = Buffer.from(req.body.data, 'base64');
      let meta, processed, mime;
      try {
        const input = sharp(bytes, { animated: true, limitInputPixels: 16777216, failOn: 'error' });
        meta = await input.metadata();
        const frames = meta.pages || 1,
          height = meta.pageHeight || meta.height;
        if (
          !['png', 'jpeg', 'webp', 'gif'].includes(meta.format) ||
          !meta.width ||
          !height ||
          meta.width > 2048 ||
          height > 2048 ||
          frames > 120 ||
          meta.width * height * frames > 16777216
        )
          throw new Error('limits');
        if (meta.format === 'gif') {
          processed = await input.gif().toBuffer();
          mime = 'image/gif';
        } else {
          processed = await input.png().toBuffer();
          mime = 'image/png';
        }
        meta.height = height;
      } catch {
        throw fail(
          'Use a valid PNG, JPG, WebP, or GIF: up to 2048px, 120 frames, and 16 million decoded pixels.',
        );
      }
      if (processed.length > 8 * 1024 * 1024) throw fail('Processed image exceeds 8MB.');
      res.status(201).json(get().addAsset(user, processed, mime, meta.width, meta.height));
    }),
  );
  router.get(
    '/assets/:id',
    route((req, res) => {
      const asset = get().asset(req.params.id);
      if (!asset) throw fail('Image not found.', 404);
      res
        .set('Cache-Control', 'public,max-age=31536000,immutable')
        .type(asset.mime)
        .send(Buffer.from(asset.bytes));
    }),
  );
  router.post(
    '/avatar',
    route((req, res) => res.json(get().setAvatar(auth(req), req.body.assetId))),
  );
  router.post(
    '/elements/:id/reactions',
    route((req, res) => {
      const user = auth(req);
      limit('reaction:' + user.id, 10, 10000);
      const result = get().react(user, req.params.id, req.body.kind);
      if (result.changed) {
        statsCache = null;
        const e = get().element(req.params.id);
        broadcast('reaction', {
          elementId: e.id,
          kind: req.body.kind,
          name: user.name,
          ownerId: e.ownerId,
          reactions: result.reactions,
        });
      }
      res.json(result);
    }),
  );
  router.get(
    '/notifications',
    route((req, res) => res.json(get().notifications(auth(req)))),
  );
  router.get(
    '/chat',
    route((_req, res) => res.json(get().messages())),
  );
  router.post(
    '/chat',
    route((req, res) => {
      const user = auth(req);
      limit('chat:' + user.id, 4, 10000);
      const message = get().chat(user, req.body.body);
      broadcast('chat:message', message);
      res.status(201).json(message);
    }),
  );
  router.use((error, _req, res, _next) => {
    if (!error.status) console.error('Permanent canvas:', error);
    res.status(error.status || 500).json({
      error: {
        message: error.status ? error.message : 'Could not save. Your draft is kept for retry.',
        blocked: error.blocked,
        freeSpace: error.freeSpace,
      },
    });
  });

  function attach(server) {
    const wss = new WebSocketServer({
      noServer: true,
      maxPayload: 65536,
      perMessageDeflate: false,
    });
    const upgrade = (req, socket, head) => {
      if (req.url !== '/api/canvas/live') return;
      if (req.headers.origin && !origins.includes(req.headers.origin)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      if ([...peers].filter((p) => p.ip === req.socket.remoteAddress).length >= 12) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    };
    server.on('upgrade', upgrade);
    wss.on('connection', (ws, req) => {
      const peer = {
        ws,
        ip: req.socket.remoteAddress,
        id: require('node:crypto').randomUUID(),
        ready: false,
        user: null,
        alive: true,
      };
      peers.add(peer);
      const timeout = setTimeout(() => {
        if (!peer.ready) ws.close(1008, 'Join first');
      }, 10000);
      ws.on('error', () => undefined);
      ws.on('pong', () => {
        peer.alive = true;
      });
      ws.on('message', (raw) => {
        try {
          limit('socket:' + peer.id, 80);
          const message = JSON.parse(raw.toString()),
            data = message.data || {};
          if (message.type === 'user:join') {
            peer.user = data.token ? get().authenticate(data.token) : null;
            if (data.token && !peer.user) {
              send(peer, 'identity:expired', {});
              ws.close(1008);
              return;
            }
            peer.ready = true;
            clearTimeout(timeout);
            send(peer, 'ready', { connectionId: peer.id });
            sendPresence();
            return;
          }
          if (!peer.ready) return;
          if (message.type === 'view') {
            if (
              ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(data[k])) &&
              data.width > 0 &&
              data.width <= 8192 &&
              data.height > 0 &&
              data.height <= 8192
            ) {
              peer.view = data;
              sendPresence();
            }
          } else if (message.type === 'cursor:move') {
            const drawing = Boolean(data.drawing) && Boolean(peer.user);
            const changed = drawing !== Boolean(peer.drawing);
            if (
              (Date.now() - (peer.lastCursor || 0) < 50 && !changed) ||
              !Number.isFinite(data.x) ||
              !Number.isFinite(data.y) ||
              Math.abs(data.x) > 1000000 ||
              Math.abs(data.y) > 1000000
            )
              return;
            peer.lastCursor = Date.now();
            peer.x = data.x;
            peer.y = data.y;
            peer.drawing = drawing;
            if (changed) sendPresence();
            broadcast(
              'cursor:move',
              {
                connectionId: peer.id,
                id: peer.user?.id || peer.id,
                name: peer.user?.name || 'Explorer',
                color: peer.user?.color || '#94a3b8',
                x: peer.x,
                y: peer.y,
                drawing: peer.drawing,
              },
              (p) => p !== peer && intersects(p, { x: peer.x, y: peer.y, width: 1, height: 1 }),
            );
          } else if (
            ['draw:start', 'draw:update', 'draw:commit'].includes(message.type) &&
            peer.user
          ) {
            if (message.type !== 'draw:commit' && Date.now() - (peer.lastDraw || 0) < 100) return;
            peer.lastDraw = Date.now();
            let element = null;
            if (message.type !== 'draw:commit') {
              element = normalizeElement(data.element);
              if (!['brush', 'pixel', 'line', 'arrow'].includes(element.type)) return;
            }
            broadcast(
              message.type,
              {
                connectionId: peer.id,
                name: peer.user.name,
                color: peer.user.color,
                element,
                x: peer.x || 0,
                y: peer.y || 0,
              },
              (p) => p !== peer && (!element || intersects(p, element)),
            );
          }
        } catch (error) {
          send(peer, 'error', { message: error.status ? error.message : 'Invalid live message.' });
        }
      });
      ws.on('close', () => {
        clearTimeout(timeout);
        peers.delete(peer);
        limits.delete('socket:' + peer.id);
        sendPresence();
      });
    });
    const heartbeat = setInterval(() => {
      for (const peer of peers) {
        if (!peer.alive) {
          peer.ws.terminate();
          continue;
        }
        peer.alive = false;
        peer.ws.ping();
      }
    }, 30000);
    heartbeat.unref();
    return () => {
      clearInterval(heartbeat);
      for (const p of peers) p.ws.terminate();
      wss.close();
      server.off('upgrade', upgrade);
      store?.close();
    };
  }
  return { router, attach, getStore: get };
}
module.exports = { createPermanentCanvas };
