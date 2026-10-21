const api = require('../../utils/api');
const ui = require('../../utils/ui');
Page({
 data: { items: [], topics: [], topic: '', school: '', loading: false, hasMore: false, page: 0, error: '' },
 onShow() { this.refresh(); },
 async refresh() {
   if (this.data.loading) return;
   this.setData({ loading: true, error: '' });
   try {
     const me = await api.bootstrap();
     const result = await api.call('posts.list', { topic: this.data.topic, page: 0 });
     this.setData({ school: me.school.name, topics: me.topics, items: result.items.map(ui.post), hasMore: result.hasMore, page: 0 });
   } catch (e) { this.setData({ error: e.message }); }
   finally { this.setData({ loading: false }); wx.stopPullDownRefresh(); }
 },
 onPullDownRefresh() { this.refresh(); },
 async onReachBottom() {
   if (this.data.loading || !this.data.hasMore) return;
   this.setData({ loading: true });
   try {
     const next = this.data.page + 1;
     const result = await api.call('posts.list', { topic: this.data.topic, page: next });
     const ids = new Set(this.data.items.map(p => p.id));
     this.setData({ items: this.data.items.concat(result.items.filter(p => !ids.has(p.id)).map(ui.post)), hasMore: result.hasMore, page: next });
   } catch (e) { ui.error(e); } finally { this.setData({ loading: false }); }
 },
 selectTopic(e) { if(this.data.loading) return; this.setData({ topic: e.currentTarget.dataset.topic }); this.refresh(); },
 open(e) { wx.navigateTo({ url: '/pages/post-detail/index?id=' + encodeURIComponent(e.currentTarget.dataset.id) }); },
 compose() { wx.navigateTo({ url: '/pages/post-compose/index' }); }
});
