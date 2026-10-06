const { randomUUID } = require('node:crypto');
const RULES_VERSION = '2026-10-06';
const categories = [
  'sexual-content',
  'child-safety',
  'harassment',
  'hate',
  'threats',
  'graphic-violence',
  'private-information',
  'malicious-content',
  'profanity',
  'other',
];
function initializeSafety(store) {
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_reports(id TEXT PRIMARY KEY,reporter_id TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,category TEXT NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canvas_safety_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,report_id TEXT NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canvas_hidden_media(asset_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canvas_hidden_chat(message_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canvas_rules_acceptance(user_id TEXT PRIMARY KEY,version TEXT NOT NULL,accepted_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canvas_deletion_requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL);
  `);
}
function installSafety({ router, get, auth, route, limit, broadcast, invalidate }) {
  const fail = (message, status = 400) => Object.assign(new Error(message), { status });
  const moderator = (req) => {
    const user = auth(req);
    if (
      !(process.env.CANVAS_MODERATOR_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .includes(user.id)
    )
      throw fail('Moderator access required.', 403);
    return user;
  };
  router.get(
    '/safety',
    route((req, res) => {
      const user = auth(req),
        db = get().db;
      res.json({
        rulesVersion: RULES_VERSION,
        accepted: Boolean(
          db
            .prepare('SELECT 1 FROM canvas_rules_acceptance WHERE user_id=? AND version=?')
            .get(user.id, RULES_VERSION),
        ),
        moderator: (process.env.CANVAS_MODERATOR_IDS || '')
          .split(',')
          .map((s) => s.trim())
          .includes(user.id),
        deletionRequest:
          db
            .prepare(
              'SELECT id,status,created_at AS createdAt FROM canvas_deletion_requests WHERE user_id=?',
            )
            .get(user.id) || null,
        reports: db
          .prepare(
            'SELECT id,target_type,target_id,category,status,created_at FROM canvas_reports WHERE reporter_id=? ORDER BY created_at DESC LIMIT 100',
          )
          .all(user.id),
      });
    }),
  );
  router.post(
    '/rules/accept',
    route((req, res) => {
      const user = auth(req);
      if (req.body.version !== RULES_VERSION || req.body.accepted !== true)
        throw fail('Read and accept the current Community Rules.');
      get()
        .db.prepare('INSERT OR REPLACE INTO canvas_rules_acceptance VALUES(?,?,?)')
        .run(user.id, RULES_VERSION, new Date().toISOString());
      res.json({ accepted: true });
    }),
  );
  router.post(
    '/reports',
    route((req, res) => {
      const user = auth(req),
        { targetType, targetId, category, reason = '' } = req.body;
      limit('report:' + user.id, 5, 3600000);
      const tables = {
        artwork: 'canvas_elements',
        chat: 'canvas_chat',
        profile: 'canvas_users',
        media: 'canvas_assets',
      };
      if (
        !Object.hasOwn(tables, targetType) ||
        typeof targetId !== 'string' ||
        !categories.includes(category) ||
        typeof reason !== 'string' ||
        reason.length > 1000
      )
        throw fail(
          'Choose a valid target and report category; notes may contain up to 1000 characters.',
        );
      if (
        !get()
          .db.prepare('SELECT 1 FROM ' + tables[targetType] + ' WHERE id=?')
          .get(targetId)
      )
        throw fail('Reported item not found.', 404);
      const existing = get()
        .db.prepare(
          "SELECT id,status FROM canvas_reports WHERE reporter_id=? AND target_type=? AND target_id=? AND status='open'",
        )
        .get(user.id, targetType, targetId);
      if (existing) return res.json(existing);
      const id = randomUUID();
      get()
        .db.prepare(
          'INSERT INTO canvas_reports(id,reporter_id,target_type,target_id,category,reason,created_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(id, user.id, targetType, targetId, category, reason.trim(), new Date().toISOString());
      res.status(201).json({ id, status: 'open' });
    }),
  );
  router.post(
    '/data-deletion-requests',
    route((req, res) => {
      const user = auth(req);
      if (req.body.confirm !== 'Request deletion of my identity data')
        throw fail('Confirm your deletion request.');
      get()
        .db.prepare(
          'INSERT OR IGNORE INTO canvas_deletion_requests(id,user_id,created_at) VALUES(?,?,?)',
        )
        .run(randomUUID(), user.id, new Date().toISOString());
      res
        .status(202)
        .json(
          get()
            .db.prepare(
              'SELECT id,status,created_at AS createdAt FROM canvas_deletion_requests WHERE user_id=?',
            )
            .get(user.id),
        );
    }),
  );
  router.get(
    '/moderation/queue',
    route((req, res) => {
      moderator(req);
      res.json({
        reports: get()
          .db.prepare(
            "SELECT * FROM canvas_reports WHERE status='open' ORDER BY created_at LIMIT 100",
          )
          .all(),
        deletionRequests: get()
          .db.prepare(
            "SELECT * FROM canvas_deletion_requests WHERE status='pending' ORDER BY created_at LIMIT 100",
          )
          .all(),
      });
    }),
  );
  router.post(
    '/moderation/reports/:id',
    route((req, res) => {
      const user = moderator(req),
        store = get(),
        { action } = req.body;
      const report = store.db.prepare('SELECT * FROM canvas_reports WHERE id=?').get(req.params.id);
      if (!report) throw fail('Report not found.', 404);
      if (!['dismiss', 'hide'].includes(action)) throw fail('Choose dismiss or hide.');
      if (report.status !== 'open') return res.json({ status: report.status });
      if (action === 'hide' && report.target_type === 'profile')
        throw fail(
          'Profile reports require operator review; do not dismiss without reviewing associated content.',
          409,
        );
      const now = new Date().toISOString();
      if (action === 'hide' && report.target_type === 'artwork') {
        const art = store.element(report.target_id);
        if (art) {
          const result = store.remove(
            { id: 'moderation-' + report.id, targets: [{ id: art.id, version: art.zIndex }] },
            user,
            { moderator: true },
          );
          broadcast('elements:remove', result);
        }
      }
      store.transaction(() => {
        if (action === 'hide' && report.target_type === 'media')
          store.db
            .prepare('INSERT OR IGNORE INTO canvas_hidden_media VALUES(?,?,?)')
            .run(report.target_id, user.id, now);
        if (action === 'hide' && report.target_type === 'chat')
          store.db
            .prepare('INSERT OR IGNORE INTO canvas_hidden_chat VALUES(?,?,?)')
            .run(report.target_id, user.id, now);
        store.db
          .prepare('UPDATE canvas_reports SET status=? WHERE id=?')
          .run(action === 'hide' ? 'hidden' : 'dismissed', report.id);
        store.db
          .prepare('INSERT INTO canvas_safety_audit VALUES(?,?,?,?,?)')
          .run(randomUUID(), user.id, report.id, action, now);
      });
      invalidate();
      broadcast('safety:refresh', {});
      res.json({ status: action === 'hide' ? 'hidden' : 'dismissed' });
    }),
  );
}
module.exports = { initializeSafety, installSafety, RULES_VERSION };
