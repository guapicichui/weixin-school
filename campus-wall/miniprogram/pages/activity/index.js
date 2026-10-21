const api=require('../../utils/api'),ui=require('../../utils/ui');
Page({
 data:{scope:'mine',items:[],page:0,hasMore:false,loading:false,error:''},
 onLoad(options){this.setData({scope:options.scope==='favorites'?'favorites':'mine'});wx.setNavigationBarTitle({title:this.data.scope==='favorites'?'我的收藏':'我的动态'});},
 onShow(){this.refresh();},
 async refresh(){if(this.data.loading)return;this.setData({loading:true,error:''});try{const r=await api.call('posts.list',{scope:this.data.scope,page:0});this.setData({items:r.items.map(ui.post),hasMore:r.hasMore,page:0});}catch(e){this.setData({error:e.message});}finally{this.setData({loading:false});}},
 async onReachBottom(){if(this.data.loading||!this.data.hasMore)return;this.setData({loading:true});try{const p=this.data.page+1,r=await api.call('posts.list',{scope:this.data.scope,page:p});const seen=new Set(this.data.items.map(n=>n.id));this.setData({items:this.data.items.concat(r.items.filter(n=>!seen.has(n.id)).map(ui.post)),hasMore:r.hasMore,page:p});}catch(e){ui.error(e);}finally{this.setData({loading:false});}},
 open(e){wx.navigateTo({url:'/pages/post-detail/index?id='+e.currentTarget.dataset.id});}
});
