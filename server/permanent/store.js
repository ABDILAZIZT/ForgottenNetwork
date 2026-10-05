const { DatabaseSync } = require('node:sqlite');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const CELL = 8,
  LIMIT = 1000000;
const hash = (token) => createHash('sha256').update(token).digest('hex');
const hex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const fail = (message, status = 400, details = {}) =>
  Object.assign(new Error(message), { status, ...details });
const dateKey = () => new Date().toISOString().slice(0, 10);

function normalizeElement(input) {
  if (!input || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.id || '')) throw fail('Invalid placement ID.');
  if (
    ![
      'brush',
      'pixel',
      'rectangle',
      'ellipse',
      'line',
      'arrow',
      'text',
      'image',
      'sticker',
      'stamp',
    ].includes(input.type)
  )
    throw fail('Unknown canvas tool.');
  const n = (v, low, high) => typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high;
  if (
    !n(input.x, -LIMIT, LIMIT) ||
    !n(input.y, -LIMIT, LIMIT) ||
    !n(input.width, 1, 512) ||
    !n(input.height, 1, 512)
  )
    throw fail('Keep placements within 512 x 512 pixels.');
  const c = input.content || {};
  if (!hex(c.color) || !n(c.opacity, 0.1, 1) || !n(c.size, 1, 64))
    throw fail('Invalid brush settings.');
  const content = { color: c.color, opacity: c.opacity, size: c.size };
  if (['brush', 'pixel', 'line', 'arrow'].includes(input.type)) {
    if (!Array.isArray(c.points) || !c.points.length || c.points.length > 1500)
      throw fail('Draw several shorter strokes.');
    content.points = c.points.map((pt) => {
      if (
        !Array.isArray(pt) ||
        pt.length !== 2 ||
        !n(pt[0], input.x, input.x + input.width) ||
        !n(pt[1], input.y, input.y + input.height)
      )
        throw fail('Invalid stroke bounds.');
      return [pt[0], pt[1]];
    });
  }
  if (input.type === 'text') {
    if (typeof c.text !== 'string' || !c.text.trim() || c.text.length > 120)
      throw fail('Text must contain 1 to 120 characters.');
    content.text = c.text.trim();
    content.font = ['Space Grotesk', 'Orbitron', 'Inter', 'Fira Code', 'Georgia'].includes(c.font)
      ? c.font
      : 'Space Grotesk';
  }
  if (['image', 'stamp'].includes(input.type)) {
    if (typeof c.assetId !== 'string') throw fail('Upload an image first.');
    content.assetId = c.assetId;
  }
  if (input.type === 'sticker') {
    if (
      !['spark', 'heart', 'planet', 'flower', 'bolt', 'peace', 'star', 'orbit'].includes(c.sticker)
    )
      throw fail('Choose a sticker from the pack.');
    content.sticker = c.sticker;
    content.animated = Boolean(c.animated);
  }
  return {
    id: input.id,
    type: input.type,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    content,
  };
}
function targetCells(e) {
  const cells = new Map(),
    add = (x, y) => cells.set(x + ',' + y, [x, y]),
    c = e.content;
  if (['brush', 'pixel'].includes(e.type)) {
    const paint = (x, y) => {
      const r = c.size / 2;
      for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++)
        for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
          add(cx, cy);
    };
    c.points.forEach((pt, i) => {
      const prev = c.points[Math.max(0, i - 1)],
        steps = Math.max(1, Math.ceil(Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) / 3));
      for (let s = 0; s <= steps; s++)
        paint(prev[0] + ((pt[0] - prev[0]) * s) / steps, prev[1] + ((pt[1] - prev[1]) * s) / steps);
    });
  } else
    for (let cy = Math.floor(e.y / CELL); cy <= Math.floor((e.y + e.height - 0.001) / CELL); cy++)
      for (let cx = Math.floor(e.x / CELL); cx <= Math.floor((e.x + e.width - 0.001) / CELL); cx++)
        add(cx, cy);
  if (cells.size > 4356) throw fail('This placement is too large.');
  return [...cells.values()];
}
class CanvasStore {
  constructor(filename, { seed = true } = {}) {
    this.areas = new Map();
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS canvas_users(id TEXT PRIMARY KEY,name TEXT NOT NULL,color TEXT NOT NULL,avatar_id TEXT,token_hash TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL,last_seen TEXT NOT NULL,streak INTEGER NOT NULL DEFAULT 1,days_active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS canvas_elements(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,owner_id TEXT NOT NULL REFERENCES canvas_users(id),owner_name TEXT NOT NULL,owner_color TEXT NOT NULL,owner_avatar TEXT,type TEXT NOT NULL,x REAL NOT NULL,y REAL NOT NULL,width REAL NOT NULL,height REAL NOT NULL,content TEXT NOT NULL,cells TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS canvas_element_bounds ON canvas_elements(x,y);
      CREATE INDEX IF NOT EXISTS canvas_element_owner ON canvas_elements(owner_id);
      CREATE TABLE IF NOT EXISTS pixel_ownership(cell_x INTEGER NOT NULL,cell_y INTEGER NOT NULL,owner_id TEXT NOT NULL REFERENCES canvas_users(id),element_id TEXT NOT NULL REFERENCES canvas_elements(id),PRIMARY KEY(cell_x,cell_y));
      CREATE INDEX IF NOT EXISTS pixel_ownership_owner ON pixel_ownership(owner_id);
      CREATE TABLE IF NOT EXISTS canvas_assets(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES canvas_users(id),mime TEXT NOT NULL,bytes BLOB NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS canvas_reactions(element_id TEXT NOT NULL REFERENCES canvas_elements(id),user_id TEXT NOT NULL REFERENCES canvas_users(id),kind TEXT NOT NULL CHECK(kind IN ('heart','fire','star')),created_at TEXT NOT NULL,PRIMARY KEY(element_id,user_id,kind));
      CREATE TABLE IF NOT EXISTS canvas_chat(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES canvas_users(id),name TEXT NOT NULL,color TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS canvas_challenges(user_id TEXT NOT NULL REFERENCES canvas_users(id),day TEXT NOT NULL,PRIMARY KEY(user_id,day));
    `);
    for (const table of ['canvas_elements', 'pixel_ownership', 'canvas_assets'])
      for (const action of ['UPDATE', 'DELETE'])
        this.db.exec(
          'CREATE TRIGGER IF NOT EXISTS immutable_' +
            table +
            '_' +
            action +
            ' BEFORE ' +
            action +
            ' ON ' +
            table +
            " BEGIN SELECT RAISE(ABORT, 'Accepted artwork is permanent'); END;",
        );
    // Migration v2: immutable artwork remains history; active occupancy becomes rebuildable.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS canvas_removed(element_id TEXT PRIMARY KEY REFERENCES canvas_elements(id), actor_id TEXT NOT NULL, removed_at TEXT NOT NULL, reason TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS canvas_mutations(id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, payload TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE VIEW IF NOT EXISTS canvas_active AS SELECT * FROM canvas_elements WHERE id NOT IN (SELECT element_id FROM canvas_removed);
      DROP TRIGGER IF EXISTS immutable_pixel_ownership_DELETE;
      DROP TRIGGER IF EXISTS immutable_pixel_ownership_UPDATE;
      PRAGMA user_version=2;
    `);
    if (seed && !this.db.prepare('SELECT 1 FROM canvas_elements LIMIT 1').get()) this.seed();
  }
  transaction(work) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  register({ name, color }) {
    if (
      typeof name !== 'string' ||
      name.trim().length < 2 ||
      name.trim().length > 24 ||
      !hex(color)
    )
      throw fail('Choose a 2-24 character name and a signature color.');
    const token = randomBytes(32).toString('hex'),
      id = randomUUID(),
      now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO canvas_users(id,name,color,token_hash,created_at,last_seen) VALUES(?,?,?,?,?,?)',
      )
      .run(id, name.trim(), color, hash(token), now, now);
    return { token, user: this.user(id) };
  }
  authenticate(token) {
    if (typeof token !== 'string' || token.length !== 64) return null;
    const row = this.db.prepare('SELECT id FROM canvas_users WHERE token_hash=?').get(hash(token));
    return row ? this.user(row.id) : null;
  }
  user(id) {
    return (
      this.db
        .prepare(
          'SELECT id,name,color,avatar_id AS avatarId,streak,days_active AS daysActive,last_seen AS lastSeen FROM canvas_users WHERE id=?',
        )
        .get(id) || null
    );
  }
  visit(id) {
    const user = this.user(id),
      today = dateKey(),
      yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (user.lastSeen.slice(0, 10) !== today)
      this.db
        .prepare(
          'UPDATE canvas_users SET streak=?,days_active=days_active+1,last_seen=? WHERE id=?',
        )
        .run(
          user.lastSeen.slice(0, 10) === yesterday ? user.streak + 1 : 1,
          new Date().toISOString(),
          id,
        );
    return this.profile(id);
  }
  row(r) {
    return r
      ? {
          id: r.id,
          ownerId: r.owner_id,
          ownerName: r.owner_name,
          ownerColor: r.owner_color,
          ownerAvatar: r.owner_avatar,
          type: r.type,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          content: JSON.parse(r.content),
          cells: JSON.parse(r.cells),
          timestamp: r.created_at,
          zIndex: r.seq,
        }
      : null;
  }
  element(id) {
    return this.row(this.db.prepare('SELECT * FROM canvas_active WHERE id=?').get(id));
  }
  place(input, user) {
    const e = normalizeElement(input);
    return this.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM canvas_removed WHERE element_id=?').get(e.id))
        throw fail('This placement was removed. It cannot be replayed.', 410);
      const existing = this.element(e.id);
      if (existing) {
        if (existing.ownerId !== user.id) throw fail('Placement ID already in use.', 409);
        return { element: existing, blocked: [], duplicate: true };
      }
      if (e.content.assetId) {
        const asset = this.asset(e.content.assetId);
        if (!asset || asset.owner_id !== user.id)
          throw fail('This image does not belong to your identity.', 403);
        e.content.animated = asset.mime === 'image/gif';
      }
      const check = this.db.prepare(
          'SELECT p.owner_id AS ownerId,e.owner_name AS ownerName FROM pixel_ownership p JOIN canvas_elements e ON e.id=p.element_id WHERE cell_x=? AND cell_y=?',
        ),
        free = [],
        blocked = [];
      for (const [cx, cy] of targetCells(e)) {
        const owner = check.get(cx, cy);
        if (owner && owner.ownerId !== user.id) blocked.push({ cx, cy, ...owner });
        else free.push([cx, cy]);
      }
      if (!free.length || (blocked.length && !['brush', 'pixel'].includes(e.type)))
        throw fail(
          'This space belongs to ' +
            (blocked[0]?.ownerName || 'another artist') +
            ' - find your own spot!',
          409,
          { blocked: blocked.slice(0, 200), freeSpace: this.findFree(e.x, e.y, e.width, e.height) },
        );
      this.db
        .prepare(
          'INSERT INTO canvas_elements(id,owner_id,owner_name,owner_color,owner_avatar,type,x,y,width,height,content,cells,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          e.id,
          user.id,
          user.name,
          user.color,
          user.avatarId,
          e.type,
          e.x,
          e.y,
          e.width,
          e.height,
          JSON.stringify(e.content),
          JSON.stringify(free),
          new Date().toISOString(),
        );
      const own = this.db.prepare('INSERT OR IGNORE INTO pixel_ownership VALUES(?,?,?,?)');
      for (const [cx, cy] of free) own.run(cx, cy, user.id, e.id);
      this.areas.delete(user.id);
      const zone = this.challenge();
      if (
        free.some(
          ([cx, cy]) =>
            cx * CELL >= zone.x &&
            cx * CELL < zone.x + zone.width &&
            cy * CELL >= zone.y &&
            cy * CELL < zone.y + zone.height,
        )
      )
        this.db
          .prepare('INSERT OR IGNORE INTO canvas_challenges VALUES(?,?)')
          .run(user.id, dateKey());
      return { element: this.element(e.id), blocked: blocked.slice(0, 200), duplicate: false };
    });
  }
  restore(id, user) {
    return this.transaction(() => {
      const removed = this.db.prepare('SELECT * FROM canvas_removed WHERE element_id=?').get(id);
      const art = this.row(this.db.prepare('SELECT * FROM canvas_elements WHERE id=?').get(id));
      if (!removed || !art) throw fail('Removed artwork not found.', 404);
      if (art.ownerId !== user.id || removed.actor_id !== user.id)
        throw fail('Only your own removals may be restored.', 403);
      if (Date.now() - Date.parse(removed.removed_at) > 30 * 86400000)
        throw fail('Recovery window expired.', 410);
      for (const [x, y] of art.cells) {
        const owner = this.db
          .prepare('SELECT owner_id FROM pixel_ownership WHERE cell_x=? AND cell_y=?')
          .get(x, y);
        if (owner && owner.owner_id !== user.id)
          throw fail('Another artist now owns this space. Restoration is blocked.', 409);
      }
      this.db.prepare('DELETE FROM canvas_removed WHERE element_id=?').run(id);
      const claim = this.db.prepare('INSERT OR IGNORE INTO pixel_ownership VALUES(?,?,?,?)');
      for (const [x, y] of art.cells) claim.run(x, y, user.id, id);
      this.areas.delete(user.id);
      return art;
    });
  }
  remove(input, user) {
    if (
      !input ||
      !/^[a-zA-Z0-9_-]{8,80}$/.test(input.id || '') ||
      !Array.isArray(input.targets) ||
      !input.targets.length ||
      input.targets.length > 400
    )
      throw fail('Choose 1 to 400 specific artworks to remove.');
    const payload = JSON.stringify(input.targets);
    return this.transaction(() => {
      const replay = this.db.prepare('SELECT * FROM canvas_mutations WHERE id=?').get(input.id);
      if (replay) {
        if (replay.actor_id !== user.id || replay.payload !== payload)
          throw fail('Removal ID already in use.', 409);
        return JSON.parse(replay.result);
      }
      const arts = input.targets.map((target) => {
        const art = this.element(target.id);
        if (!art) throw fail('Artwork changed or was removed. Refresh before trying again.', 409);
        if (art.ownerId !== user.id) throw fail('You can only remove your own artwork.', 403);
        if (art.zIndex !== target.version)
          throw fail('Artwork version changed. Refresh first.', 409);
        return art;
      });
      if (new Set(arts.map((a) => a.id)).size !== arts.length) throw fail('Duplicate targets.');
      const now = new Date().toISOString();
      for (const art of arts)
        this.db
          .prepare('INSERT INTO canvas_removed VALUES(?,?,?,?)')
          .run(art.id, user.id, now, 'owner removal');
      // Rebuild only this artist's claims from surviving history. Other identities are untouched.
      this.db.prepare('DELETE FROM pixel_ownership WHERE owner_id=?').run(user.id);
      const claim = this.db.prepare('INSERT OR IGNORE INTO pixel_ownership VALUES(?,?,?,?)');
      for (const row of this.db
        .prepare('SELECT * FROM canvas_active WHERE owner_id=? ORDER BY seq')
        .all(user.id))
        for (const [x, y] of JSON.parse(row.cells)) claim.run(x, y, user.id, row.id);
      this.areas.delete(user.id);
      const result = { removed: arts.map((a) => a.id) };
      this.db
        .prepare('INSERT INTO canvas_mutations VALUES(?,?,?,?,?)')
        .run(input.id, user.id, payload, JSON.stringify(result), now);
      return result;
    });
  }
  load({ x = -1024, y = -1024, width = 2048, height = 2048, after = 0 }) {
    if (
      ![x, y, width, height, after].every(Number.isFinite) ||
      width < 1 ||
      height < 1 ||
      width > 8192 ||
      height > 8192
    )
      throw fail('Invalid view bounds.');
    const rows = this.db
      .prepare(
        'SELECT * FROM canvas_active WHERE x<? AND x+width>? AND y<? AND y+height>? AND seq>? ORDER BY seq LIMIT 401',
      )
      .all(x + width, x, y + height, y, after);
    return {
      snapshot: this.db.prepare('SELECT COALESCE(max(seq),0) AS n FROM canvas_elements').get().n,
      elements: rows.slice(0, 400).map((r) => this.row(r)),
      next: rows.length > 400 ? rows[399].seq : null,
    };
  }
  findFree(x, y, width = 160, height = 120) {
    width = Math.min(512, Math.max(8, width));
    height = Math.min(512, Math.max(8, height));
    const check = this.db.prepare(
      'SELECT 1 FROM pixel_ownership WHERE cell_x>=? AND cell_x<=? AND cell_y>=? AND cell_y<=? LIMIT 1',
    );
    for (let ring = 0; ring < 24; ring++)
      for (let i = 0; i < Math.max(1, ring * 8); i++) {
        const a = (i / Math.max(1, ring * 8)) * Math.PI * 2,
          px = Math.round((x + Math.cos(a) * ring * 80) / 8) * 8,
          py = Math.round((y + Math.sin(a) * ring * 80) / 8) * 8;
        if (Math.abs(px) > LIMIT - 512 || Math.abs(py) > LIMIT - 512) continue;
        if (
          !check.get(
            px / 8,
            Math.floor((px + width - 0.001) / 8),
            py / 8,
            Math.floor((py + height - 0.001) / 8),
          )
        )
          return { x: px, y: py };
      }
    throw fail('This neighborhood is full. Explore farther out.', 409);
  }
  challenge() {
    const day = Math.floor(Date.now() / 86400000);
    return { x: 640 + (day % 5) * 256, y: -256, width: 192, height: 192, day: dateKey(), xp: 100 };
  }
  largestArea(id) {
    if (this.areas.has(id)) return this.areas.get(id);
    const cells = this.db
        .prepare('SELECT cell_x AS x,cell_y AS y FROM pixel_ownership WHERE owner_id=?')
        .all(id),
      unseen = new Set(cells.map((c) => c.x + ',' + c.y));
    let largest = 0;
    while (unseen.size) {
      const queue = [unseen.values().next().value];
      unseen.delete(queue[0]);
      let count = 0;
      while (queue.length) {
        const [x, y] = queue.pop().split(',').map(Number);
        count++;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const key = x + dx + ',' + (y + dy);
          if (unseen.delete(key)) queue.push(key);
        }
      }
      largest = Math.max(largest, count * 64);
    }
    this.areas.set(id, largest);
    return largest;
  }
  profile(id) {
    const summary = this.db
      .prepare(
        "SELECT count(*) AS elements,COALESCE(sum(json_array_length(cells)*64),0) AS pixels,COALESCE(sum(CASE WHEN type IN ('image','stamp') THEN 1 ELSE 0 END),0) AS images FROM canvas_active WHERE owner_id=?",
      )
      .get(id);
    summary.pixels = this.db
      .prepare('SELECT count(*)*64 AS n FROM pixel_ownership WHERE owner_id=?')
      .get(id).n;
    const last = this.row(
      this.db
        .prepare('SELECT * FROM canvas_elements WHERE owner_id=? ORDER BY seq DESC LIMIT 1')
        .get(id),
    );
    const neighbors = this.db
      .prepare(
        'SELECT count(DISTINCT b.owner_id) AS count FROM pixel_ownership a JOIN pixel_ownership b ON b.cell_x BETWEEN a.cell_x-1 AND a.cell_x+1 AND b.cell_y BETWEEN a.cell_y-1 AND a.cell_y+1 WHERE a.owner_id=? AND b.owner_id<>?',
      )
      .get(id, id).count;
    const largest = this.largestArea(id);
    const crown = this.db
      .prepare('SELECT DISTINCT owner_id AS id FROM canvas_active')
      .all()
      .every((owner) => this.largestArea(owner.id) <= largest);
    const badges = [];
    if (summary.elements) badges.push('First Stroke');
    if (summary.pixels >= 1000) badges.push('1000 Pixels');
    if (summary.images >= 10) badges.push('Image Artist');
    if (neighbors >= 5) badges.push('Social Butterfly');
    if (largest > 0 && crown) badges.push('Territory King');
    const challengeDone = Boolean(
      this.db
        .prepare('SELECT 1 FROM canvas_challenges WHERE user_id=? AND day=?')
        .get(id, dateKey()),
    );
    const challenges = this.db
      .prepare('SELECT count(*) AS count FROM canvas_challenges WHERE user_id=?')
      .get(id).count;
    return {
      ...this.user(id),
      ...summary,
      largestArea: largest,
      neighbors,
      badges,
      last,
      challengeDone,
      xp: summary.elements * 10 + challenges * 100,
    };
  }
  stats() {
    const total = this.db
      .prepare(
        'SELECT count(*) AS artworks,COALESCE(sum(json_array_length(cells)*64),0) AS pixels,count(DISTINCT owner_id) AS artists FROM canvas_active',
      )
      .get();
    total.pixels = this.db.prepare('SELECT count(*)*64 AS n FROM pixel_ownership').get().n;
    const leaderboard = this.db
      .prepare(
        'SELECT owner_id AS id,owner_name AS name,owner_color AS color,sum(json_array_length(cells)*64) AS pixels,count(*) AS elements FROM canvas_active WHERE created_at>=? GROUP BY owner_id ORDER BY pixels DESC LIMIT 10',
      )
      .all(new Date(Date.now() - 7 * 86400000).toISOString());
    const density = this.db
      .prepare(
        'SELECT CAST(floor(cell_x/64.0) AS INTEGER) AS x,CAST(floor(cell_y/64.0) AS INTEGER) AS y,count(*) AS cells FROM pixel_ownership GROUP BY 1,2 ORDER BY cells DESC LIMIT 1000',
      )
      .all();
    const spotlight = this.row(
      this.db
        .prepare(
          'SELECT e.* FROM canvas_active e LEFT JOIN canvas_reactions r ON r.element_id=e.id GROUP BY e.id ORDER BY count(r.user_id) DESC,e.seq DESC LIMIT 1',
        )
        .get(),
    );
    for (const entry of leaderboard)
      entry.pixels = this.db
        .prepare('SELECT count(*)*64 AS n FROM pixel_ownership WHERE owner_id=?')
        .get(entry.id).n;
    leaderboard.sort((a, b) => b.pixels - a.pixels);
    return { ...total, leaderboard, density, spotlight, challenge: this.challenge() };
  }
  addAsset(user, buffer, mime, width, height) {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO canvas_assets VALUES(?,?,?,?,?,?,?)')
      .run(id, user.id, mime, buffer, width, height, new Date().toISOString());
    return { id, width, height, mime, url: '/api/canvas/assets/' + id };
  }
  asset(id) {
    return this.db.prepare('SELECT * FROM canvas_assets WHERE id=?').get(id);
  }
  setAvatar(user, id) {
    const a = this.asset(id);
    if (!a || a.owner_id !== user.id || a.width > 32 || a.height > 32)
      throw fail('Avatars must be at most 32 x 32 pixels.');
    this.db.prepare('UPDATE canvas_users SET avatar_id=? WHERE id=?').run(id, user.id);
    return this.user(user.id);
  }
  reactions(id) {
    return this.db
      .prepare(
        'SELECT kind,count(*) AS count FROM canvas_reactions WHERE element_id=? GROUP BY kind',
      )
      .all(id);
  }
  react(user, id, kind) {
    if (!['heart', 'fire', 'star'].includes(kind) || !this.element(id))
      throw fail('Artwork or reaction not found.', 404);
    const r = this.db
      .prepare('INSERT OR IGNORE INTO canvas_reactions VALUES(?,?,?,?)')
      .run(id, user.id, kind, new Date().toISOString());
    return { changed: r.changes > 0, reactions: this.reactions(id) };
  }
  notifications(user) {
    return this.db
      .prepare(
        'SELECT r.kind,r.created_at AS timestamp,u.name,u.color,e.id AS elementId,e.x,e.y FROM canvas_reactions r JOIN canvas_elements e ON e.id=r.element_id JOIN canvas_users u ON u.id=r.user_id WHERE e.owner_id=? AND r.user_id<>? ORDER BY r.created_at DESC LIMIT 40',
      )
      .all(user.id, user.id);
  }
  chat(user, body) {
    if (typeof body !== 'string' || !body.trim() || body.length > 280)
      throw fail('Messages must contain 1 to 280 characters.');
    const m = {
      id: randomUUID(),
      userId: user.id,
      name: user.name,
      color: user.color,
      body: body.trim(),
      timestamp: new Date().toISOString(),
    };
    this.db
      .prepare('INSERT INTO canvas_chat VALUES(?,?,?,?,?,?)')
      .run(m.id, user.id, user.name, user.color, m.body, m.timestamp);
    return m;
  }
  messages() {
    return this.db
      .prepare(
        'SELECT id,user_id AS userId,name,color,body,created_at AS timestamp FROM canvas_chat ORDER BY created_at DESC LIMIT 60',
      )
      .all()
      .reverse();
  }
  seed() {
    const { user } = this.register({ name: 'Forgotten Studio', color: '#a78bfa' });
    for (const [sticker, x, y, width, height, color] of [
      ['planet', -320, -240, 208, 208, '#a78bfa'],
      ['flower', -48, 48, 144, 144, '#f9a8d4'],
      ['heart', 320, -80, 144, 144, '#fb7185'],
      ['orbit', 80, -352, 160, 160, '#22d3ee'],
      ['bolt', -416, 112, 104, 144, '#fbbf24'],
      ['star', 400, 192, 104, 104, '#a3e635'],
    ])
      this.place(
        {
          id: randomUUID(),
          type: 'sticker',
          x,
          y,
          width,
          height,
          content: { sticker, color, size: 2, opacity: 1, animated: sticker === 'orbit' },
        },
        user,
      );
    this.place(
      {
        id: randomUUID(),
        type: 'text',
        x: -32,
        y: -104,
        width: 296,
        height: 88,
        content: {
          text: 'MAKE SOMETHING\nTHAT STAYS.',
          font: 'Space Grotesk',
          color: '#ffffff',
          opacity: 1,
          size: 26,
        },
      },
      user,
    );
  }
  close() {
    this.db.close();
  }
}
module.exports = { CanvasStore, normalizeElement, targetCells, CELL, fail };
