const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { randomUUID } = require('node:crypto');
const { createPermanentCanvas } = require('../permanent/api');

test('reports and deletion requests are authenticated, private and auditable; moderator removal cannot be restored by owner', async (t) => {
  const app = express();
  app.use(express.json());
  const canvas = createPermanentCanvas({ filename: ':memory:' });
  app.use('/api/canvas', canvas.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const store = canvas.getStore();
  const owner = store.register({ name: 'Artist', color: '#ffffff' });
  const reviewer = store.register({ name: 'Reviewer', color: '#ffffff' });
  const previous = process.env.CANVAS_MODERATOR_IDS;
  process.env.CANVAS_MODERATOR_IDS = reviewer.user.id;
  t.after(async () => {
    if (previous === undefined) delete process.env.CANVAS_MODERATOR_IDS;
    else process.env.CANVAS_MODERATOR_IDS = previous;
    await new Promise((resolve) => server.close(resolve));
    store.close();
  });
  const request = async (path, token, body) => {
    const response = await fetch(
      'http://127.0.0.1:' + server.address().port + '/api/canvas' + path,
      {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    return { status: response.status, data: await response.json() };
  };
  const art = store.place(
    {
      id: randomUUID(),
      type: 'rectangle',
      x: 12000,
      y: 12000,
      width: 16,
      height: 16,
      content: { color: '#ffffff', size: 4, opacity: 1 },
    },
    owner.user,
  ).element;
  const payload = {
    targetType: 'artwork',
    targetId: art.id,
    category: 'other',
    reason: 'Please review this test.',
  };
  assert.equal((await request('/reports', null, payload)).status, 401);
  const report = await request('/reports', owner.token, payload);
  assert.equal(report.status, 201);
  assert.equal((await request('/reports', owner.token, payload)).data.id, report.data.id);
  assert.equal((await request('/moderation/queue', owner.token)).status, 403);
  assert.equal(
    (await request('/moderation/reports/' + report.data.id, owner.token, { action: 'hide' }))
      .status,
    403,
  );
  assert.equal(
    (await request('/moderation/reports/' + report.data.id, reviewer.token, { action: 'hide' }))
      .status,
    200,
  );
  assert.equal(store.element(art.id), null);
  assert.throws(() => store.restore(art.id, owner.user), { status: 403 });
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM canvas_safety_audit').get().n, 1);
  assert.equal((await request('/safety', reviewer.token)).data.reports.length, 0);
  assert.equal((await request('/safety', owner.token)).data.reports[0].status, 'hidden');
  assert.equal(
    (await request('/data-deletion-requests', owner.token, { userId: reviewer.user.id })).status,
    400,
  );
  const deletion = await request('/data-deletion-requests', owner.token, {
    confirm: 'Request deletion of my identity data',
    userId: reviewer.user.id,
  });
  assert.equal(deletion.status, 202);
  assert.equal((await request('/safety', reviewer.token)).data.deletionRequest, null);
  assert.equal(
    (
      await request('/data-deletion-requests', owner.token, {
        confirm: 'Request deletion of my identity data',
      })
    ).data.id,
    deletion.data.id,
  );
  const chat = store.chat(owner.user, 'A test message');
  const chatReport = await request('/reports', owner.token, {
    targetType: 'chat',
    targetId: chat.id,
    category: 'other',
  });
  assert.equal(
    (await request('/moderation/reports/' + chatReport.data.id, reviewer.token, { action: 'hide' }))
      .status,
    200,
  );
  assert.equal(
    store.messages().some((m) => m.id === chat.id),
    false,
  );
  const asset = store.addAsset(owner.user, Buffer.from('test'), 'image/png', 1, 1);
  const mediaReport = await request('/reports', owner.token, {
    targetType: 'media',
    targetId: asset.id,
    category: 'other',
  });
  assert.equal(
    (
      await request('/moderation/reports/' + mediaReport.data.id, reviewer.token, {
        action: 'hide',
      })
    ).status,
    200,
  );
  assert.equal((await request('/assets/' + asset.id)).status, 404);
});
