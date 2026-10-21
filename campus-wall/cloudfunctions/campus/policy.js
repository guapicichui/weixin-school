'use strict';
class AppError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function fail(code, message) { throw new AppError(code, message); }
function text(value, name, min, max) {
  if (typeof value !== 'string') fail('INVALID_INPUT', name + '格式不正确');
  const result = value.trim();
  if (result.length < min || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) {
    fail('INVALID_INPUT', name + '长度须为 ' + min + '–' + max + ' 个字符');
  }
  return result;
}
function id(value) { return text(value, '标识', 1, 100); }
function requestId(value) {
  const result = text(value, '请求标识', 12, 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) fail('INVALID_INPUT', '请求标识格式不正确');
  return result;
}
function phone(value) {
  const result = text(value, '联系电话', 11, 11);
  if (!/^1[3-9]\d{9}$/.test(result)) fail('INVALID_INPUT', '请填写有效的手机号');
  return result;
}
function money(value) {
  if (!Number.isSafeInteger(value) || value < 100 || value > 100000) {
    fail('INVALID_INPUT', '跑腿费须为 1–1000 元，金额精确到分');
  }
  return value;
}
function page(value) {
  const result = value == null ? 0 : value;
  if (!Number.isInteger(result) || result < 0 || result > 500) fail('INVALID_INPUT', '分页参数不正确');
  return result;
}
function publicUser(user) {
  return { id: user._id, nickname: user.nickname, bio: user.bio, runnerStatus: user.runnerStatus };
}
function publicPost(post, uid) {
  return {
    id: post._id, title: post.title, content: post.content, topic: post.topic,
    authorId: post.authorId, authorName: post.authorName, createdAt: post.createdAt,
    likeCount: post.likeCount, commentCount: post.commentCount, isMine: post.authorId === uid
  };
}
function publicOrder(order, uid) {
  const participant = order.ownerId === uid || order.runnerId === uid;
  const result = {
    id: order._id, title: order.title, description: order.description,
    pickupArea: order.pickupArea, deliveryArea: order.deliveryArea,
    feeCents: order.feeCents, status: order.status, dueAt: order.dueAt,
    createdAt: order.createdAt, ownerName: order.ownerName, runnerName: order.runnerName || '',
    isOwner: order.ownerId === uid, isRunner: order.runnerId === uid,
    settlement: 'offline'
  };
  if (participant) Object.assign(result, {
    pickupAddress: order.pickupAddress, deliveryAddress: order.deliveryAddress,
    contactPhone: order.contactPhone, runnerPhone: order.runnerPhone || ''
  });
  return result;
}
module.exports = { AppError, fail, text, id, requestId, phone, money, page, publicUser, publicPost, publicOrder };
