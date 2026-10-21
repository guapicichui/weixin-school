'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeService } = require('../cloudfunctions/campus/service');
const { makeRepository } = require('../cloudfunctions/campus/repository');
const { makeMemoryStore } = require('./memory-store');
function fixture(extra) {
  const store = makeMemoryStore();
  let clock = 1700000000000, sequence = 0;
  // Test-only identifiers; production uses SHA-256 in index.js.
  const hash = value => {
    let result = 2166136261;
    for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
    return (result >>> 0).toString(16).padStart(8, '0').repeat(4);
  };
  const service = makeService(Object.assign({ store, hash, now: () => clock, schoolId: 'school-a', adminOpenids: ['admin'] }, extra || {}));
  const call = (action, data = {}, openid = 'alice') => service.execute(action, data, { openid });
  return {
    store, call, service, hash,
    advance: ms => { clock += ms; },
    now: () => clock,
    async users(names = ['alice', 'bob', 'charlie', 'admin']) {
      for (const name of names) {
        await call('profile.me', {}, name);
        await call('profile.save', { nickname: name + '_同学', bio: '' }, name);
      }
    },
    async post(openid = 'alice') {
      return call('posts.create', { title: '校园交流', content: '今天一起学习吧', topic: '学习交流', requestId: 'request_post_' + (++sequence) }, openid);
    },
    async order(openid = 'alice', overrides = {}) {
      return call('orders.create', Object.assign({
        title: '帮取快递', description: '小件物品',
        pickupArea: '东门驿站', deliveryArea: '南区宿舍',
        pickupAddress: '东门 A 柜 1234', deliveryAddress: '宿舍 5 栋 302',
        phone: '13800000001', feeCents: 500, dueAt: clock + 3600000,
        requestId: 'request_order_' + (++sequence)
      }, overrides), openid);
    },
    async runner(openid = 'bob') {
      const me = await call('profile.me', {}, openid);
      await call('runner.apply', { realName: '张同学', studentNo: '20260001', phone: '13900000002', agreed: true }, openid);
      await call('admin.reviewRunner', { id: me.user.id, decision: 'approved' }, 'admin');
      return me.user.id;
    }
  };
}
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code);

test('rejects requests without trusted WeChat identity', async () => {
  const f = fixture();
  await rejectsCode(f.service.execute('profile.me', {}, {}), 'UNAUTHENTICATED');
});
test('dispatch rejects inherited property names and unknown actions', async () => {
  const f = fixture();
  await rejectsCode(f.call('__proto__'), 'UNKNOWN_ACTION');
  await rejectsCode(f.call('constructor'), 'UNKNOWN_ACTION');
});
test('concurrent bootstrap creates exactly one account per identity', async () => {
  const f = fixture();
  const results = await Promise.all([f.call('profile.me'), f.call('profile.me')]);
  assert.equal(results[0].user.id, results[1].user.id);
  assert.equal(Object.keys(f.store.dump().users).length, 1);
});
test('client profile fields cannot grant admin or runner privileges', async () => {
  const f = fixture(); await f.users();
  await f.call('profile.save', { nickname: '正常同学', bio: '', runnerStatus: 'approved', isAdmin: true, openid: 'admin' });
  const me = await f.call('profile.me');
  assert.equal(me.isAdmin, false);
  assert.equal(me.user.runnerStatus, 'none');
});
test('post creation is idempotent for repeated request IDs', async () => {
  const f = fixture(); await f.users();
  const input = { title: '同一个帖子', content: '同一段内容', topic: '校园日常', requestId: 'request_fixed_001' };
  const a = await f.call('posts.create', input);
  const b = await f.call('posts.create', input);
  assert.equal(a.id, b.id);
  assert.equal(Object.keys(f.store.dump().posts).length, 1);
});
test('failed content checking prevents publication', async () => {
  const f = fixture({ moderate: async content => { if (content.includes('拦截内容')) throw Object.assign(new Error('内容被拦截'), { code: 'CONTENT_REJECTED' }); } });
  await f.users();
  await rejectsCode(f.call('posts.create', { title: '拦截内容', content: '测试内容', topic: '校园日常', requestId: 'request_blocked_1' }), 'CONTENT_REJECTED');
  assert.equal(Object.keys(f.store.dump().posts || {}).length, 0);
});
test('another user cannot delete an author post', async () => {
  const f = fixture(); await f.users(); const p = await f.post();
  await rejectsCode(f.call('posts.remove', { id: p.id }, 'bob'), 'FORBIDDEN');
  assert.equal((await f.call('posts.get', { id: p.id })).title, '校园交流');
});
test('likes are idempotent and cannot make counters negative', async () => {
  const f = fixture(); await f.users(); const p = await f.post();
  await Promise.all([f.call('posts.react', { id: p.id, kind: 'like', active: true }, 'bob'), f.call('posts.react', { id: p.id, kind: 'like', active: true }, 'bob')]);
  assert.equal((await f.call('posts.get', { id: p.id })).likeCount, 1);
  await f.call('posts.react', { id: p.id, kind: 'like', active: false }, 'bob');
  await f.call('posts.react', { id: p.id, kind: 'like', active: false }, 'bob');
  assert.equal((await f.call('posts.get', { id: p.id })).likeCount, 0);
});
test('favorites are private to their owner', async () => {
  const f = fixture(); await f.users(); const p = await f.post();
  await f.call('posts.react', { id: p.id, kind: 'favorite', active: true }, 'bob');
  assert.equal((await f.call('posts.list', { scope: 'favorites' }, 'bob')).items.length, 1);
  assert.equal((await f.call('posts.list', { scope: 'favorites' }, 'charlie')).items.length, 0);
});
test('comments notify the author and cannot be deleted by strangers', async () => {
  const f = fixture(); await f.users(); const p = await f.post();
  const c = await f.call('comments.create', { postId: p.id, content: '一起学习', requestId: 'request_comment_1' }, 'bob');
  assert.equal((await f.call('posts.get', { id: p.id })).commentCount, 1);
  assert.equal((await f.call('notifications.list')).items.length, 1);
  assert.equal((await f.call('notifications.list', {}, 'charlie')).items.length, 0);
  await rejectsCode(f.call('comments.remove', { id: c.id }, 'charlie'), 'FORBIDDEN');
  await f.call('comments.remove', { id: c.id }, 'bob');
  await f.call('comments.remove', { id: c.id }, 'bob');
  assert.equal((await f.call('posts.get', { id: p.id })).commentCount, 0);
});
test('one user cannot mark another user notification read', async () => {
  const f = fixture(); await f.users(); const p = await f.post();
  await f.call('comments.create', { postId: p.id, content: '你好同学', requestId: 'request_comment_2' }, 'bob');
  const message = (await f.call('notifications.list')).items[0];
  await rejectsCode(f.call('notifications.read', { id: message.id }, 'bob'), 'FORBIDDEN');
  assert.equal((await f.call('notifications.list')).items[0].read, false);
});
test('unapproved users cannot accept orders', async () => {
  const f = fixture(); await f.users(); const o = await f.order();
  await rejectsCode(f.call('orders.transition', { id: o.id, transition: 'accept' }, 'bob'), 'RUNNER_REQUIRED');
});
test('runner applications require consent and admin-only review', async () => {
  const f = fixture(); await f.users();
  const me = await f.call('profile.me', {}, 'bob');
  await rejectsCode(f.call('runner.apply', { realName: '张同学', studentNo: '20260001', phone: '13900000002', agreed: false }, 'bob'), 'INVALID_INPUT');
  await f.call('runner.apply', { realName: '张同学', studentNo: '20260001', phone: '13900000002', agreed: true }, 'bob');
  await rejectsCode(f.call('admin.reviewRunner', { id: me.user.id, decision: 'approved' }, 'bob'), 'FORBIDDEN');
  assert.equal((await f.call('profile.me', {}, 'bob')).user.runnerStatus, 'pending');
});
test('an approved runner cannot accept their own order', async () => {
  const f = fixture(); await f.users(); await f.runner('alice'); const o = await f.order();
  await rejectsCode(f.call('orders.transition', { id: o.id, transition: 'accept' }), 'FORBIDDEN');
});
test('two runners accepting concurrently produce exactly one winner', async () => {
  const f = fixture(); await f.users(); await f.runner('bob'); await f.runner('charlie'); const o = await f.order();
  const results = await Promise.allSettled(['bob', 'charlie'].map(user => f.call('orders.transition', { id: o.id, transition: 'accept' }, user)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'ORDER_UNAVAILABLE');
  assert.equal((await f.call('orders.get', { id: o.id })).status, 'accepted');
});
test('order delivery and confirmation enforce participant roles and state', async () => {
  const f = fixture(); await f.users(); await f.runner('bob'); const o = await f.order();
  await f.call('orders.transition', { id: o.id, transition: 'accept' }, 'bob');
  await rejectsCode(f.call('orders.transition', { id: o.id, transition: 'complete' }), 'INVALID_STATE');
  await rejectsCode(f.call('orders.transition', { id: o.id, transition: 'deliver' }, 'charlie'), 'FORBIDDEN');
  await f.call('orders.transition', { id: o.id, transition: 'deliver' }, 'bob');
  await rejectsCode(f.call('orders.transition', { id: o.id, transition: 'complete' }, 'bob'), 'FORBIDDEN');
  await f.call('orders.transition', { id: o.id, transition: 'complete' });
  assert.equal((await f.call('orders.transition', { id: o.id, transition: 'complete' })).status, 'completed');
});
test('phone numbers and detailed addresses are hidden from the order market', async () => {
  const f = fixture(); await f.users(); await f.runner('bob'); const o = await f.order();
  const market = (await f.call('orders.list', {}, 'bob')).items[0];
  assert.equal(market.contactPhone, undefined);
  assert.equal(market.pickupAddress, undefined);
  const before = await f.call('orders.get', { id: o.id }, 'bob');
  assert.equal(before.deliveryAddress, undefined);
  const accepted = await f.call('orders.transition', { id: o.id, transition: 'accept' }, 'bob');
  assert.equal(accepted.contactPhone, '13800000001');
  assert.equal(accepted.pickupAddress, '东门 A 柜 1234');
  await rejectsCode(f.call('orders.get', { id: o.id }, 'charlie'), 'FORBIDDEN');
});
test('money uses integer cents and bounded deadlines', async () => {
  const f = fixture(); await f.users();
  for (const feeCents of [0, 99, 100001, 150.5, '500']) await rejectsCode(f.order('alice', { feeCents }), 'INVALID_INPUT');
  await rejectsCode(f.order('alice', { dueAt: f.now() - 1 }), 'INVALID_INPUT');
  await rejectsCode(f.order('alice', { dueAt: f.now() + 8 * 86400000 }), 'INVALID_INPUT');
});
test('expired orders cannot be accepted', async () => {
  const f = fixture(); await f.users(); await f.runner('bob'); const o = await f.order();
  f.advance(3600001);
  await rejectsCode(f.call('orders.transition', { id: o.id, transition: 'accept' }, 'bob'), 'ORDER_EXPIRED');
  assert.equal((await f.call('orders.list', {}, 'bob')).items.length, 0);
});
test('cancellation is owner-only and only allowed before acceptance', async () => {
  const f = fixture(); await f.users(); await f.runner('bob'); const o = await f.order();
  await rejectsCode(f.call('orders.transition', { id: o.id, transition: 'cancel' }, 'bob'), 'FORBIDDEN');
  await f.call('orders.transition', { id: o.id, transition: 'accept' }, 'bob');
  await rejectsCode(f.call('orders.transition', { id: o.id, transition: 'cancel' }), 'INVALID_STATE');
});
test('rejected runners may correct and resubmit their applications', async () => {
  const f = fixture(); await f.users();
  const user = await f.call('profile.me', {}, 'bob');
  const input = { realName: '张同学', studentNo: '20260001', phone: '13900000002', agreed: true };
  await f.call('runner.apply', input, 'bob');
  await f.call('admin.reviewRunner', { id: user.user.id, decision: 'rejected', reason: '学号需要核实' }, 'admin');
  assert.equal((await f.call('profile.me', {}, 'bob')).runnerApplication.reason, '学号需要核实');
  await f.call('runner.apply', input, 'bob');
  assert.equal((await f.call('profile.me', {}, 'bob')).user.runnerStatus, 'pending');
});
test('only admins can view runner identity documents and pending reports', async () => {
  const f = fixture(); await f.users();
  await f.call('runner.apply', { realName: '张同学', studentNo: '20260001', phone: '13900000002', agreed: true }, 'bob');
  await rejectsCode(f.call('admin.runners', {}, 'alice'), 'FORBIDDEN');
  await rejectsCode(f.call('admin.reports', {}, 'alice'), 'FORBIDDEN');
  const me = await f.call('profile.me', {}, 'bob');
  assert.equal(me.runnerApplication.phone, undefined);
  assert.equal((await f.call('admin.runners', {}, 'admin')).items[0].phone, '13900000002');
});
test('admins can inspect reports and hide the reported post', async () => {
  const f = fixture(); await f.users(); const p = await f.post();
  const report = await f.call('reports.create', { targetType: 'post', targetId: p.id, reason: '需要核查内容' }, 'bob');
  const pending = await f.call('admin.reports', {}, 'admin');
  assert.match(pending.items[0].preview, /今天一起学习吧/);
  await rejectsCode(f.call('admin.resolveReport', { id: report.id, decision: 'hide' }, 'bob'), 'FORBIDDEN');
  await f.call('admin.resolveReport', { id: report.id, decision: 'hide' }, 'admin');
  await rejectsCode(f.call('posts.get', { id: p.id }), 'NOT_FOUND');
});
test('moderating a comment updates the visible comment counter once', async () => {
  const f = fixture(); await f.users(); const p = await f.post();
  const c = await f.call('comments.create', { postId: p.id, content: '待核查评论', requestId: 'request_comment_9' }, 'bob');
  const r = await f.call('reports.create', { targetType: 'comment', targetId: c.id, reason: '需要核查内容' });
  await f.call('admin.resolveReport', { id: r.id, decision: 'hide' }, 'admin');
  await f.call('admin.resolveReport', { id: r.id, decision: 'hide' }, 'admin');
  assert.equal((await f.call('posts.get', { id: p.id })).commentCount, 0);
});
test('school boundary is checked for individual document reads', async () => {
  const f = fixture(); await f.users();
  await f.store.set('posts', 'foreign-post', { _id: 'foreign-post', schoolId: 'another-school', status: 'published' });
  await rejectsCode(f.call('posts.get', { id: 'foreign-post' }), 'NOT_FOUND');
});
test('paging returns 20 items and a hasMore flag', async () => {
  const f = fixture(); await f.users();
  for (let i = 0; i < 21; i++) { await f.post(); f.advance(10001); }
  const first = await f.call('posts.list', { page: 0 });
  const second = await f.call('posts.list', { page: 1 });
  assert.equal(first.items.length, 20);
  assert.equal(first.hasMore, true);
  assert.equal(second.items.length, 1);
  assert.equal(second.hasMore, false);
});
test('order creation ignores client supplied ownership and status', async () => {
  const f = fixture(); await f.users();
  const o = await f.order('alice', { ownerId: 'attacker', runnerId: 'attacker', status: 'completed' });
  const row = await f.call('orders.get', { id: o.id });
  assert.equal(row.isOwner, true);
  assert.equal(row.isRunner, false);
  assert.equal(row.status, 'waiting');
});
test('transaction rollback does not persist partial changes', async () => {
  const store = makeMemoryStore();
  await assert.rejects(store.transaction(async tx => { await tx.set('orders', 'one', { _id: 'one', status: 'accepted' }); throw new Error('abort'); }), /abort/);
  assert.equal(await store.get('orders', 'one'), null);
});
test('cloud repository unwraps transaction result and strips document IDs on writes', async () => {
  let saved;
  const scope = { collection: () => ({ doc: () => ({ set: async value => { saved = value.data; }, get: async () => ({ data: { _id: 'one', value: 1 } }) }) }) };
  const db = Object.assign({}, scope, { runTransaction: async callback => ({ result: await callback(scope) }) });
  const repo = makeRepository(db);
  assert.equal(await repo.transaction(async tx => { await tx.set('x', 'one', { _id: 'one', value: 2 }); return 42; }), 42);
  assert.deepEqual(saved, { value: 2 });
});
test('cloud repository does not swallow missing-collection or permission errors', async () => {
  const db = { collection: () => ({ doc: () => ({ get: async () => { throw new Error('document.get:fail -502005 database collection does not exist'); } }) }) };
  await assert.rejects(makeRepository(db).get('missing', 'one'), /collection does not exist/);
});

test('cloud repository treats missing documents as empty without masking other errors', async () => {
  const db = { collection: () => ({ doc: () => ({ get: async () => { throw new Error('document.get:fail -1 document does not exist'); } }) }) };
  assert.equal(await makeRepository(db).get('users', 'new-user'), null);
});
test('notification failures roll back the order acceptance itself', async () => {
  const f = fixture(); await f.users(); await f.runner('bob'); const order = await f.order();
  const wrappedStore = Object.assign({}, f.store, {
    transaction: callback => f.store.transaction(tx => callback(Object.assign({}, tx, {
      set: async (collection, id, value) => {
        if (collection === 'notifications') throw new Error('notification storage failure');
        return tx.set(collection, id, value);
      }
    })))
  });
  const service = makeService({ store: wrappedStore, hash: f.hash, now: f.now, schoolId: 'school-a', adminOpenids: ['admin'] });
  await assert.rejects(service.execute('orders.transition', { id: order.id, transition: 'accept' }, { openid: 'bob' }), /notification storage failure/);
  assert.equal((await f.call('orders.get', { id: order.id })).status, 'waiting');
});
