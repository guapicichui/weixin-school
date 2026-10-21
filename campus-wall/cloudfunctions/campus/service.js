'use strict';
const P = require('./policy');
const TOPICS = ['校园日常', '学习交流', '失物招领', '二手闲置', '活动组队'];
const COLLECTIONS = ['users', 'posts', 'comments', 'likes', 'favorites', 'runnerApplications', 'orders', 'notifications', 'reports'];
function makeService(options) {
  const { store, hash, moderate = async () => {}, now = Date.now } = options;
  const schoolId = options.schoolId || 'default-school';
  const schoolName = options.schoolName || '我的校园';
  const admins = options.adminOpenids || [];
  const documentId = (kind, value) => hash(kind + ':' + value);
  const userId = openid => documentId('user', openid);
  const required = (doc, kind) => { if (!doc || doc.schoolId !== schoolId) P.fail('NOT_FOUND', kind + '不存在'); return doc; };
  const isAdmin = ctx => admins.includes(ctx.openid);
  const admin = ctx => { if (!isAdmin(ctx)) P.fail('FORBIDDEN', '需要管理员权限'); };
  const paged = (collection, filter, data, orderBy) => store.list(collection, Object.assign({ schoolId }, filter), {
    skip: P.page(data.page) * 20, limit: 21, orderBy: orderBy || [['createdAt', 'desc'], ['_id', 'desc']]
  }).then(rows => ({ items: rows.slice(0, 20), hasMore: rows.length > 20 }));
  async function ensureUser(ctx) {
    const uid = userId(ctx.openid);
    return store.transaction(async tx => {
      let user = await tx.get('users', uid);
      if (!user) {
        user = { _id: uid, schoolId, nickname: '校园同学', bio: '', runnerStatus: 'none', createdAt: now(), updatedAt: now(), lastPostAt: 0, lastCommentAt: 0, lastOrderAt: 0 };
        await tx.set('users', uid, user);
      }
      required(user, '用户');
      return user;
    });
  }
  async function actor(ctx) {
    return required(await store.get('users', userId(ctx.openid)), '用户');
  }
  function notification(tx, key, recipientId, title, targetType, targetId, senderId) {
    if (!recipientId || recipientId === senderId) return Promise.resolve();
    const nid = documentId('notification', key + ':' + recipientId);
    return tx.set('notifications', nid, { _id: nid, schoolId, recipientId, title, targetType, targetId, read: false, createdAt: now() });
  }
  function activePost(post) {
    required(post, '帖子');
    if (post.status !== 'published') P.fail('NOT_FOUND', '帖子已删除或下架');
    return post;
  }
  async function postState(uid, pid) {
    const [like, favorite] = await Promise.all([
      store.get('likes', documentId('like', uid + ':' + pid)),
      store.get('favorites', documentId('favorite', uid + ':' + pid))
    ]);
    return { liked: Boolean(like && like.active), favorited: Boolean(favorite && favorite.active) };
  }
  const actions = {
    async 'profile.identity'(data, ctx) { return { openid: ctx.openid, userId: userId(ctx.openid) }; },
    async 'profile.me'(data, ctx) {
      const user = await ensureUser(ctx);
      const application = await store.get('runnerApplications', user._id);
      return { user: P.publicUser(user), isAdmin: isAdmin(ctx), school: { id: schoolId, name: schoolName }, topics: TOPICS, runnerApplication: application ? { status: application.status, reason: application.reason || '' } : null };
    },
    async 'profile.save'(data, ctx) {
      const nickname = P.text(data.nickname, '昵称', 2, 20);
      const bio = P.text(data.bio || '', '个人介绍', 0, 160);
      await moderate(nickname + '\n' + bio, ctx.openid);
      const uid = userId(ctx.openid);
      return store.transaction(async tx => {
        const user = required(await tx.get('users', uid), '用户');
        Object.assign(user, { nickname, bio, updatedAt: now() });
        await tx.set('users', uid, user);
        return P.publicUser(user);
      });
    },
    async 'posts.list'(data, ctx) {
      const uid = userId(ctx.openid);
      const filter = { status: 'published' };
      if (data.topic) {
        if (!TOPICS.includes(data.topic)) P.fail('INVALID_INPUT', '话题不存在');
        filter.topic = data.topic;
      }
      if (data.scope === 'mine') filter.authorId = uid;
      if (data.scope === 'favorites') {
        const saved = await paged('favorites', { userId: uid, active: true }, data);
        const posts = await Promise.all(saved.items.map(row => store.get('posts', row.postId)));
        return { items: posts.filter(p => p && p.schoolId === schoolId && p.status === 'published').map(p => P.publicPost(p, uid)), hasMore: saved.hasMore };
      }
      const result = await paged('posts', filter, data);
      return { items: result.items.map(p => P.publicPost(p, uid)), hasMore: result.hasMore };
    },
    async 'posts.get'(data, ctx) {
      const post = activePost(await store.get('posts', P.id(data.id)));
      return Object.assign(P.publicPost(post, userId(ctx.openid)), await postState(userId(ctx.openid), post._id));
    },
    async 'posts.create'(data, ctx) {
      const title = P.text(data.title, '标题', 1, 60);
      const content = P.text(data.content, '正文', 1, 2000);
      if (!TOPICS.includes(data.topic)) P.fail('INVALID_INPUT', '请选择有效话题');
      const uid = userId(ctx.openid);
      const pid = documentId('post', uid + ':' + P.requestId(data.requestId));
      const existing = await store.get('posts', pid);
      if (existing) return { id: existing._id };
      await moderate(title + '\n' + content, ctx.openid);
      return store.transaction(async tx => {
        const duplicate = await tx.get('posts', pid);
        if (duplicate) return { id: duplicate._id };
        const user = required(await tx.get('users', uid), '用户');
        if (user.lastPostAt && now() - user.lastPostAt < 10000) P.fail('TOO_FAST', '发帖过于频繁，请稍后再试');
        const post = { _id: pid, schoolId, title, content, topic: data.topic, authorId: uid, authorName: user.nickname, status: 'published', likeCount: 0, commentCount: 0, createdAt: now(), updatedAt: now() };
        await tx.set('posts', pid, post);
        await tx.set('users', uid, Object.assign(user, { lastPostAt: now() }));
        return { id: pid };
      });
    },
    async 'posts.remove'(data, ctx) {
      const uid = userId(ctx.openid);
      return store.transaction(async tx => {
        const post = required(await tx.get('posts', P.id(data.id)), '帖子');
        if (post.authorId !== uid && !isAdmin(ctx)) P.fail('FORBIDDEN', '只能删除自己的帖子');
        post.status = 'deleted'; post.updatedAt = now();
        await tx.set('posts', post._id, post);
        return { removed: true };
      });
    },
    async 'posts.react'(data, ctx) {
      if (!['like', 'favorite'].includes(data.kind) || typeof data.active !== 'boolean') P.fail('INVALID_INPUT', '互动参数不正确');
      const uid = userId(ctx.openid);
      const pid = P.id(data.id);
      const collection = data.kind === 'like' ? 'likes' : 'favorites';
      const rid = documentId(data.kind, uid + ':' + pid);
      return store.transaction(async tx => {
        const post = activePost(await tx.get('posts', pid));
        required(await tx.get('users', uid), '用户');
        const record = await tx.get(collection, rid);
        const wasActive = Boolean(record && record.active);
        if (wasActive !== data.active) {
          await tx.set(collection, rid, { _id: rid, schoolId, userId: uid, postId: pid, active: data.active, createdAt: now() });
          if (data.kind === 'like') {
            post.likeCount = Math.max(0, post.likeCount + (data.active ? 1 : -1));
            await tx.set('posts', pid, post);
          }
        }
        return { active: data.active, likeCount: post.likeCount };
      });
    },
    async 'comments.list'(data, ctx) {
      const post = activePost(await store.get('posts', P.id(data.postId)));
      const result = await paged('comments', { postId: post._id, status: 'published' }, data, [['createdAt', 'asc'], ['_id', 'asc']]);
      return { items: result.items.map(c => ({ id: c._id, content: c.content, authorName: c.authorName, createdAt: c.createdAt, isMine: c.authorId === userId(ctx.openid) })), hasMore: result.hasMore };
    },
    async 'comments.create'(data, ctx) {
      const content = P.text(data.content, '评论', 1, 500);
      const pid = P.id(data.postId);
      const uid = userId(ctx.openid);
      const cid = documentId('comment', uid + ':' + P.requestId(data.requestId));
      const existing = await store.get('comments', cid);
      if (existing) return { id: cid };
      await moderate(content, ctx.openid);
      return store.transaction(async tx => {
        if (await tx.get('comments', cid)) return { id: cid };
        const post = activePost(await tx.get('posts', pid));
        const user = required(await tx.get('users', uid), '用户');
        if (user.lastCommentAt && now() - user.lastCommentAt < 2000) P.fail('TOO_FAST', '评论过于频繁，请稍后再试');
        await tx.set('comments', cid, { _id: cid, schoolId, postId: pid, authorId: uid, authorName: user.nickname, content, status: 'published', createdAt: now() });
        post.commentCount += 1;
        await tx.set('posts', pid, post);
        await tx.set('users', uid, Object.assign(user, { lastCommentAt: now() }));
        await notification(tx, cid, post.authorId, user.nickname + ' 评论了你的帖子', 'post', pid, uid);
        return { id: cid };
      });
    },
    async 'comments.remove'(data, ctx) {
      const uid = userId(ctx.openid);
      return store.transaction(async tx => {
        const comment = required(await tx.get('comments', P.id(data.id)), '评论');
        if (comment.authorId !== uid && !isAdmin(ctx)) P.fail('FORBIDDEN', '只能删除自己的评论');
        if (comment.status === 'published') {
          const post = required(await tx.get('posts', comment.postId), '帖子');
          post.commentCount = Math.max(0, post.commentCount - 1);
          await tx.set('posts', post._id, post);
          comment.status = 'deleted';
          await tx.set('comments', comment._id, comment);
        }
        return { removed: true };
      });
    },
    async 'runner.apply'(data, ctx) {
      const realName = P.text(data.realName, '姓名', 2, 30);
      const studentNo = P.text(data.studentNo, '学号', 4, 30);
      const contactPhone = P.phone(data.phone);
      if (data.agreed !== true) P.fail('INVALID_INPUT', '请先同意跑腿服务约定');
      const uid = userId(ctx.openid);
      return store.transaction(async tx => {
        const user = required(await tx.get('users', uid), '用户');
        const old = await tx.get('runnerApplications', uid);
        if (old && ['pending', 'approved'].includes(old.status)) return { status: old.status };
        await tx.set('runnerApplications', uid, { _id: uid, schoolId, nickname: user.nickname, realName, studentNo, phone: contactPhone, status: 'pending', reason: '', createdAt: now(), updatedAt: now() });
        user.runnerStatus = 'pending';
        await tx.set('users', uid, user);
        return { status: 'pending' };
      });
    },
    async 'orders.create'(data, ctx) {
      const uid = userId(ctx.openid);
      const oid = documentId('order', uid + ':' + P.requestId(data.requestId));
      const fields = {
        title: P.text(data.title, '需求标题', 2, 60), description: P.text(data.description || '', '需求说明', 0, 1000),
        pickupArea: P.text(data.pickupArea, '取件区域', 1, 30), deliveryArea: P.text(data.deliveryArea, '送达区域', 1, 30),
        pickupAddress: P.text(data.pickupAddress, '取件地址', 2, 120), deliveryAddress: P.text(data.deliveryAddress, '送达地址', 2, 120),
        contactPhone: P.phone(data.phone), feeCents: P.money(data.feeCents)
      };
      const dueAt = data.dueAt;
      if (!Number.isSafeInteger(dueAt) || dueAt <= now() || dueAt > now() + 7 * 86400000) P.fail('INVALID_INPUT', '截止时间须在未来七天内');
      const existing = await store.get('orders', oid);
      if (existing) return { id: oid };
      await moderate(fields.title + '\n' + fields.description, ctx.openid);
      return store.transaction(async tx => {
        if (await tx.get('orders', oid)) return { id: oid };
        const user = required(await tx.get('users', uid), '用户');
        if (user.lastOrderAt && now() - user.lastOrderAt < 5000) P.fail('TOO_FAST', '发单过于频繁，请稍后再试');
        await tx.set('orders', oid, Object.assign(fields, { _id: oid, schoolId, dueAt, ownerId: uid, ownerName: user.nickname, runnerId: '', runnerName: '', runnerPhone: '', status: 'waiting', settlement: 'offline', createdAt: now(), updatedAt: now() }));
        await tx.set('users', uid, Object.assign(user, { lastOrderAt: now() }));
        return { id: oid };
      });
    },
    async 'orders.list'(data, ctx) {
      const uid = userId(ctx.openid);
      let filter;
      if (data.scope === 'mine') filter = { ownerId: uid };
      else if (data.scope === 'accepted') filter = { runnerId: uid };
      else filter = { status: 'waiting', dueAt: { $gt: now() } };
      const result = await paged('orders', filter, data);
      return { items: result.items.map(o => P.publicOrder(o, uid)), hasMore: result.hasMore };
    },
    async 'orders.get'(data, ctx) {
      const order = required(await store.get('orders', P.id(data.id)), '订单');
      const uid = userId(ctx.openid);
      if (order.status !== 'waiting' && order.ownerId !== uid && order.runnerId !== uid && !isAdmin(ctx)) P.fail('FORBIDDEN', '只能查看与自己有关的订单');
      return P.publicOrder(order, uid);
    },
    async 'orders.transition'(data, ctx) {
      const uid = userId(ctx.openid);
      const oid = P.id(data.id);
      const transition = data.transition;
      if (!['accept', 'deliver', 'complete', 'cancel'].includes(transition)) P.fail('INVALID_INPUT', '订单操作不正确');
      return store.transaction(async tx => {
        const order = required(await tx.get('orders', oid), '订单');
        const user = required(await tx.get('users', uid), '用户');
        let recipient;
        let title;
        if (transition === 'accept') {
          if (order.ownerId === uid) P.fail('FORBIDDEN', '不能接自己的订单');
          const application = await tx.get('runnerApplications', uid);
          if (user.runnerStatus !== 'approved' || !application || application.status !== 'approved') P.fail('RUNNER_REQUIRED', '请先申请成为跑腿员并通过审核');
          if (order.runnerId === uid && order.status === 'accepted') return P.publicOrder(order, uid);
          if (order.status !== 'waiting') P.fail('ORDER_UNAVAILABLE', '订单已被接取或已结束');
          if (order.dueAt <= now()) P.fail('ORDER_EXPIRED', '订单已超过接单截止时间');
          Object.assign(order, { runnerId: uid, runnerName: user.nickname, runnerPhone: application.phone, status: 'accepted', acceptedAt: now() });
          recipient = order.ownerId; title = '你的跑腿订单已被接取';
        } else if (transition === 'deliver') {
          if (order.runnerId !== uid) P.fail('FORBIDDEN', '只有接单跑腿员可以确认送达');
          if (order.status === 'delivered') return P.publicOrder(order, uid);
          if (order.status !== 'accepted') P.fail('INVALID_STATE', '当前订单不能确认送达');
          order.status = 'delivered'; order.deliveredAt = now();
          recipient = order.ownerId; title = '跑腿员已送达，请确认完成';
        } else if (transition === 'complete') {
          if (order.ownerId !== uid) P.fail('FORBIDDEN', '只有发单人可以确认完成');
          if (order.status === 'completed') return P.publicOrder(order, uid);
          if (order.status !== 'delivered') P.fail('INVALID_STATE', '须先由跑腿员确认送达');
          order.status = 'completed'; order.completedAt = now();
          recipient = order.runnerId; title = '发单人已确认订单完成';
        } else {
          if (order.ownerId !== uid) P.fail('FORBIDDEN', '只有发单人可以取消订单');
          if (order.status === 'cancelled') return P.publicOrder(order, uid);
          if (order.status !== 'waiting') P.fail('INVALID_STATE', '已接取的订单不能直接取消');
          order.status = 'cancelled';
        }
        order.updatedAt = now();
        await tx.set('orders', oid, order);
        await notification(tx, oid + ':' + transition, recipient, title, 'order', oid, uid);
        return P.publicOrder(order, uid);
      });
    },
    async 'notifications.list'(data, ctx) {
      const result = await paged('notifications', { recipientId: userId(ctx.openid) }, data);
      return { items: result.items.map(n => ({ id: n._id, title: n.title, targetType: n.targetType, targetId: n.targetId, read: n.read, createdAt: n.createdAt })), hasMore: result.hasMore };
    },
    async 'notifications.read'(data, ctx) {
      return store.transaction(async tx => {
        const row = required(await tx.get('notifications', P.id(data.id)), '消息');
        if (row.recipientId !== userId(ctx.openid)) P.fail('FORBIDDEN', '不能读取他人的消息');
        row.read = true;
        await tx.set('notifications', row._id, row);
        return { read: true };
      });
    },
    async 'reports.create'(data, ctx) {
      const uid = userId(ctx.openid);
      if (!['post', 'comment', 'order'].includes(data.targetType)) P.fail('INVALID_INPUT', '举报对象不正确');
      const targetId = P.id(data.targetId);
      const reason = P.text(data.reason, '举报原因', 2, 300);
      const mapping = { post: 'posts', comment: 'comments', order: 'orders' };
      const target = required(await store.get(mapping[data.targetType], targetId), '举报对象');
      if (data.targetType === 'order' && target.ownerId !== uid && target.runnerId !== uid) P.fail('FORBIDDEN', '只能举报自己参与的订单');
      if (data.targetType === 'post') activePost(target);
      const rid = documentId('report', uid + ':' + data.targetType + ':' + targetId);
      return store.transaction(async tx => {
        const old = await tx.get('reports', rid);
        if (old) return { id: rid };
        await tx.set('reports', rid, { _id: rid, schoolId, reporterId: uid, targetType: data.targetType, targetId, reason, status: 'pending', createdAt: now() });
        return { id: rid };
      });
    },
    async 'admin.runners'(data, ctx) {
      admin(ctx);
      const result = await paged('runnerApplications', { status: 'pending' }, data);
      return { items: result.items.map(r => ({ id: r._id, nickname: r.nickname, realName: r.realName, studentNo: r.studentNo, phone: r.phone, createdAt: r.createdAt })), hasMore: result.hasMore };
    },
    async 'admin.reviewRunner'(data, ctx) {
      admin(ctx);
      if (!['approved', 'rejected'].includes(data.decision)) P.fail('INVALID_INPUT', '审核结果不正确');
      const reason = P.text(data.reason || '', '审核说明', data.decision === 'rejected' ? 2 : 0, 200);
      return store.transaction(async tx => {
        const row = required(await tx.get('runnerApplications', P.id(data.id)), '申请');
        if (row.status !== 'pending') P.fail('INVALID_STATE', '此申请已处理');
        const user = required(await tx.get('users', row._id), '用户');
        row.status = data.decision; row.reason = reason; row.reviewedBy = userId(ctx.openid); row.updatedAt = now();
        user.runnerStatus = data.decision;
        await tx.set('runnerApplications', row._id, row);
        await tx.set('users', user._id, user);
        await notification(tx, 'runner-review:' + row._id + ':' + row.createdAt, user._id, data.decision === 'approved' ? '跑腿员申请已通过，现在可以接单' : '跑腿员申请未通过，请查看审核说明', 'runner', user._id, userId(ctx.openid));
        return { status: row.status };
      });
    },
    
async 'admin.reports'(data, ctx) {
      admin(ctx);
      const result = await paged('reports', { status: 'pending' }, data);
      const mapping = { post: 'posts', comment: 'comments', order: 'orders' };
      result.items = await Promise.all(result.items.map(async row => {
        const target = await store.get(mapping[row.targetType], row.targetId);
        const preview = target && target.schoolId === schoolId ? [target.title, target.content || target.description].filter(Boolean).join('\n').slice(0, 2200) : '';
        return Object.assign({}, row, { id: row._id, preview });
      }));
      return result;
    },
    async 'admin.resolveReport'(data, ctx) {
      admin(ctx);
      const decision = data.decision;
      if (!['dismiss', 'hide'].includes(decision)) P.fail('INVALID_INPUT', '处理结果不正确');
      return store.transaction(async tx => {
        const report = required(await tx.get('reports', P.id(data.id)), '举报');
        if (report.status !== 'pending') return { resolved: true };
        if (decision === 'hide') {
          if (!['post', 'comment'].includes(report.targetType)) P.fail('INVALID_INPUT', '订单举报仅支持记录处理结果');
          const collection = report.targetType === 'post' ? 'posts' : 'comments';
          const target = required(await tx.get(collection, report.targetId), '举报对象');
          if (report.targetType === 'comment' && target.status === 'published') {
            const post = required(await tx.get('posts', target.postId), '帖子');
            post.commentCount = Math.max(0, post.commentCount - 1);
            await tx.set('posts', post._id, post);
          }
          target.status = 'hidden';
          await tx.set(collection, target._id, target);
        }
        report.status = 'resolved'; report.decision = decision; report.resolvedAt = now(); report.resolvedBy = userId(ctx.openid);
        await tx.set('reports', report._id, report);
        return { resolved: true };
      });
    }
  };
  return {
    async execute(action, data, ctx) {
      if (!ctx || typeof ctx.openid !== 'string' || !ctx.openid) P.fail('UNAUTHENTICATED', '请在微信小程序中访问');
      if (!Object.prototype.hasOwnProperty.call(actions, action)) P.fail('UNKNOWN_ACTION', '接口不存在');
      if (!data || typeof data !== 'object' || Array.isArray(data)) P.fail('INVALID_INPUT', '请求数据不正确');
      return actions[action](data, ctx);
    },
    collections: COLLECTIONS
  };
}
module.exports = { makeService, COLLECTIONS, TOPICS };
