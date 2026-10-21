function error(err) { wx.showToast({ title: err && err.message || '操作失败，请稍后重试', icon: 'none', duration: 3000 }); }
function toast(title) { wx.showToast({ title, icon: 'success' }); }
function date(value) {
  const d = new Date(value);
  const pad = n => String(n).padStart(2, '0');
  return (d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function post(row) { return Object.assign({}, row, { time: date(row.createdAt), initial: (row.authorName || '同').slice(0, 1) }); }
const statuses = { waiting: '待接单', accepted: '配送中', delivered: '待确认', completed: '已完成', cancelled: '已取消' };
function order(row) {
  return Object.assign({}, row, { time: date(row.createdAt), dueTime: date(row.dueAt), fee: (row.feeCents / 100).toFixed(2), statusLabel: row.status === 'waiting' && row.dueAt <= Date.now() ? '已过期' : statuses[row.status] });
}
function confirm(content) { return new Promise(resolve => wx.showModal({ title: '请确认', content, success: res => resolve(res.confirm), fail: () => resolve(false) })); }
function report(targetType, targetId) {
  const reasons = ['违规或不友善内容', '广告或垃圾信息', '涉嫌欺诈', '侵犯个人隐私'];
  return new Promise(resolve => wx.showActionSheet({ itemList: reasons, success: res => resolve({ targetType, targetId, reason: reasons[res.tapIndex] }), fail: () => resolve(null) }));
}
module.exports = { error, toast, date, post, order, confirm, report };
