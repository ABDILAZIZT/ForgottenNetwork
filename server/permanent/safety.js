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
const AUTO_HIDE_ACTOR = 'system:auto-hide';
const AUTO_HIDE_THRESHOLD = 3;
function initializeSafety(store) {
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_reports(id TEXT PRIMARY KEY,reporter_id TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,category TEXT NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canvas_safety_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,report_id TEXT NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canvas_hidden_media(asset_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canvas_hidden_chat(message_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canvas_pending_media(asset_id TEXT PRIMARY KEY REFERENCES canvas_assets(id),owner_id TEXT NOT NULL REFERENCES canvas_users(id),created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canvas_media_safety_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,asset_id TEXT NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canvas_auto_hidden(target_type TEXT NOT NULL,target_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(target_type,target_id));
    CREATE TABLE IF NOT EXISTS canvas_safety_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canvas_rules_acceptance(user_id TEXT PRIMARY KEY,version TEXT NOT NULL,accepted_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canvas_deletion_requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL);
  `);
  if (!store.db.prepare("SELECT 1 FROM canvas_safety_meta WHERE key='media-review-v1'").get()) {
    store.transaction(() => {
      store.db
        .prepare(
          'INSERT OR IGNORE INTO canvas_pending_media(asset_id,owner_id,created_at) SELECT a.id,a.owner_id,a.created_at FROM canvas_assets a LEFT JOIN canvas_hidden_media h ON h.asset_id=a.id LEFT JOIN canvas_pending_media p ON p.asset_id=a.id WHERE h.asset_id IS NULL AND p.asset_id IS NULL',
        )
        .run();
      store.db
        .prepare("INSERT INTO canvas_safety_meta(key,value) VALUES('media-review-v1',?)")
        .run(new Date().toISOString());
    });
  }
}
function openReporterCount(db, targetType, targetId) {
  return db
    .prepare(
      "SELECT count(DISTINCT reporter_id) AS n FROM canvas_reports WHERE target_type=? AND target_id=? AND status='open' AND reporter_id IS NOT NULL",
    )
    .get(targetType, targetId).n;
}
function autoHideReportedContent(store, targetType, targetId) {
  const { db } = store;
  if (targetType === 'profile' || openReporterCount(db, targetType, targetId) < AUTO_HIDE_THRESHOLD)
    return false;
  if (
    db
      .prepare('SELECT 1 FROM canvas_auto_hidden WHERE target_type=? AND target_id=?')
      .get(targetType, targetId)
  )
    return false;
  const createdAt = new Date().toISOString();
  if (targetType === 'artwork') {
    const art = store.element(targetId);
    if (!art) return false;
    store.remove(
      { id: 'auto-hide-' + randomUUID(), targets: [{ id: art.id, version: art.zIndex }] },
      { id: AUTO_HIDE_ACTOR },
      { moderator: true, reason: 'automatic safety hold' },
    );
  } else if (targetType === 'media') {
    if (
      !db.prepare('SELECT 1 FROM canvas_assets WHERE id=?').get(targetId) ||
      db.prepare('SELECT 1 FROM canvas_hidden_media WHERE asset_id=?').get(targetId) ||
      db.prepare('SELECT 1 FROM canvas_pending_media WHERE asset_id=?').get(targetId)
    )
      return false;
    db.prepare('INSERT INTO canvas_hidden_media VALUES(?,?,?)').run(
      targetId,
      AUTO_HIDE_ACTOR,
      createdAt,
    );
  } else if (targetType === 'chat') {
    if (
      !db.prepare('SELECT 1 FROM canvas_chat WHERE id=?').get(targetId) ||
      db.prepare('SELECT 1 FROM canvas_hidden_chat WHERE message_id=?').get(targetId)
    )
      return false;
    db.prepare('INSERT INTO canvas_hidden_chat VALUES(?,?,?)').run(
      targetId,
      AUTO_HIDE_ACTOR,
      createdAt,
    );
  } else return false;
  db.prepare('INSERT INTO canvas_auto_hidden VALUES(?,?,?)').run(targetType, targetId, createdAt);
  return true;
}
function releaseAutoHide(store, targetType, targetId, moderator) {
  const { db } = store;
  const row = db
    .prepare('SELECT 1 FROM canvas_auto_hidden WHERE target_type=? AND target_id=?')
    .get(targetType, targetId);
  if (!row || openReporterCount(db, targetType, targetId) >= AUTO_HIDE_THRESHOLD) return false;
  if (targetType === 'artwork') store.restore(targetId, moderator, { moderator: true });
  if (targetType === 'media')
    db.prepare('DELETE FROM canvas_hidden_media WHERE asset_id=? AND actor_id=?').run(
      targetId,
      AUTO_HIDE_ACTOR,
    );
  if (targetType === 'chat')
    db.prepare('DELETE FROM canvas_hidden_chat WHERE message_id=? AND actor_id=?').run(
      targetId,
      AUTO_HIDE_ACTOR,
    );
  db.prepare('DELETE FROM canvas_auto_hidden WHERE target_type=? AND target_id=?').run(
    targetType,
    targetId,
  );
  return true;
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
            'SELECT r.id,r.target_type,r.target_id,r.category,r.status,r.created_at,EXISTS(SELECT 1 FROM canvas_auto_hidden h WHERE h.target_type=r.target_type AND h.target_id=r.target_id) AS automatic_hidden FROM canvas_reports r WHERE r.reporter_id=? ORDER BY r.created_at DESC LIMIT 100',
          )
          .all(user.id),
        pendingUploads: db
          .prepare(
            'SELECT a.id,a.mime,a.width,a.height,p.created_at FROM canvas_pending_media p JOIN canvas_assets a ON a.id=p.asset_id WHERE p.owner_id=? ORDER BY p.created_at DESC LIMIT 100',
          )
          .all(user.id),
        mediaReviews: db
          .prepare(
            'SELECT a.asset_id AS id,a.action,a.created_at FROM canvas_media_safety_audit a JOIN canvas_assets c ON c.id=a.asset_id WHERE c.owner_id=? ORDER BY a.created_at DESC LIMIT 100',
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
      const store = get(),
        id = randomUUID();
      const automaticHidden = store.transaction(() => {
        store.db
          .prepare(
            'INSERT INTO canvas_reports(id,reporter_id,target_type,target_id,category,reason,created_at) VALUES(?,?,?,?,?,?,?)',
          )
          .run(
            id,
            user.id,
            targetType,
            targetId,
            category,
            reason.trim(),
            new Date().toISOString(),
          );
        return autoHideReportedContent(store, targetType, targetId);
      });
      if (automaticHidden && targetType === 'artwork')
        broadcast('elements:remove', { removed: [targetId] });
      if (automaticHidden) {
        invalidate();
        broadcast('safety:refresh', {});
      }
      res.status(201).json({ id, status: 'open', automaticHidden });
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
            "SELECT r.*,EXISTS(SELECT 1 FROM canvas_auto_hidden h WHERE h.target_type=r.target_type AND h.target_id=r.target_id) AS automatic_hidden FROM canvas_reports r WHERE r.status='open' ORDER BY r.created_at LIMIT 100",
          )
          .all(),
        pendingMedia: get()
          .db.prepare(
            'SELECT p.asset_id AS id,p.created_at,a.mime,a.width,a.height,u.name AS owner_name FROM canvas_pending_media p JOIN canvas_assets a ON a.id=p.asset_id JOIN canvas_users u ON u.id=p.owner_id ORDER BY p.created_at LIMIT 100',
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
      const releasedAutomaticHold = store.transaction(() => {
        if (action === 'hide' && report.target_type === 'media') {
          store.db
            .prepare('DELETE FROM canvas_pending_media WHERE asset_id=?')
            .run(report.target_id);
          store.db
            .prepare('INSERT OR IGNORE INTO canvas_hidden_media VALUES(?,?,?)')
            .run(report.target_id, user.id, now);
        }
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
        if (action === 'hide')
          store.db
            .prepare('DELETE FROM canvas_auto_hidden WHERE target_type=? AND target_id=?')
            .run(report.target_type, report.target_id);
        else return releaseAutoHide(store, report.target_type, report.target_id, user);
        return false;
      });
      if (releasedAutomaticHold && report.target_type === 'artwork') {
        const restored = store.element(report.target_id);
        if (restored) broadcast('element:restore', restored);
      }
      invalidate();
      broadcast('safety:refresh', {});
      res.json({ status: action === 'hide' ? 'hidden' : 'dismissed' });
    }),
  );
  router.get(
    '/moderation/media/:id',
    route((req, res) => {
      moderator(req);
      const asset = get().pendingMedia(req.params.id);
      if (!asset) throw fail('Pending upload not found.', 404);
      res
        .set('Cache-Control', 'no-store')
        .set('X-Content-Type-Options', 'nosniff')
        .set('Content-Security-Policy', "default-src 'none'")
        .type(asset.mime)
        .send(Buffer.from(asset.bytes));
    }),
  );
  router.post(
    '/moderation/media/:id',
    route((req, res) => {
      const user = moderator(req),
        store = get(),
        { action } = req.body;
      if (!['approve', 'reject'].includes(action)) throw fail('Choose approve or reject.');
      const now = new Date().toISOString();
      store.transaction(() => {
        const asset = store.pendingMedia(req.params.id);
        if (!asset) throw fail('Pending upload not found.', 404);
        store.db.prepare('DELETE FROM canvas_pending_media WHERE asset_id=?').run(asset.id);
        if (action === 'reject')
          store.db
            .prepare('INSERT OR IGNORE INTO canvas_hidden_media VALUES(?,?,?)')
            .run(asset.id, user.id, now);
        store.db
          .prepare('INSERT INTO canvas_media_safety_audit VALUES(?,?,?,?,?)')
          .run(randomUUID(), user.id, asset.id, action, now);
      });
      invalidate();
      broadcast('safety:refresh', {});
      res.json({ status: action === 'approve' ? 'approved' : 'rejected' });
    }),
  );
}
module.exports = { initializeSafety, installSafety, RULES_VERSION };
