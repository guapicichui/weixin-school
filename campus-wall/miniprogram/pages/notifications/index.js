const api=require('../../utils/api'),ui=require('../../utils/ui');
Page({
 data:{items:[],loading:false,page:0,hasMore:false,error:''},
 onShow(){this.refresh();},
 async refresh(){if(this.data.loading)return;this.setData({loading:true,error:''});try{const r=await api.call('notifications.list',{page:0});this.setData({items:r.items.map(n=>Object.assign({},n,{time:ui.date(n.createdAt)})),hasMore:r.hasMore,page:0});}catch(e){this.setData({error:e.message});}finally{this.setData({loading:false});wx.stopPullDownRefresh();}},
 onPullDownRefresh(){this.refresh();},
 async onReachBottom(){if(this.data.loading||!this.data.hasMore)return;this.setData({loading:true});try{const p=this.data.page+1,r=await api.call('notifications.list',{page:p});const seen=new Set(this.data.items.map(n=>n.id));this.setData({items:this.data.items.concat(r.items.filter(n=>!seen.has(n.id)).map(n=>Object.assign({},n,{time:ui.date(n.createdAt)}))),hasMore:r.hasMore,page:p});}catch(e){ui.error(e);}finally{this.setData({loading:false});}},
 async open(e){const item=this.data.items.find(n=>n.id===e.currentTarget.dataset.id);if(!item)return;try{await api.call('notifications.read',{id:item.id});this.setData({items:this.data.items.map(n=>n.id===item.id?Object.assign({},n,{read:true}):n)});const routes={post:'/pages/post-detail/index?id=',order:'/pages/errand-detail/index?id=',runner:'/pages/runner-apply/index'};wx.navigateTo({url:item.targetType==='runner'?routes.runner:routes[item.targetType]+item.targetId});}catch(err){ui.error(err);}}
});
