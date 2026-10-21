const api=require('../../utils/api');
const ui=require('../../utils/ui');
Page({
 data:{items:[],scope:'market',page:0,hasMore:false,loading:false,error:'',runnerStatus:'none'},
 onShow(){this.refresh();},
 async refresh(){
  if(this.data.loading)return;
  this.setData({loading:true,error:''});
  try{const me=await api.bootstrap(true);const r=await api.call('orders.list',{scope:this.data.scope,page:0});this.setData({items:r.items.map(ui.order),hasMore:r.hasMore,page:0,runnerStatus:me.user.runnerStatus});}
  catch(e){this.setData({error:e.message});}finally{this.setData({loading:false});wx.stopPullDownRefresh();}
 },
 scope(e){if(this.data.loading)return;this.setData({scope:e.currentTarget.dataset.scope});this.refresh();},
 onPullDownRefresh(){this.refresh();},
 async onReachBottom(){
  if(this.data.loading||!this.data.hasMore)return;
  this.setData({loading:true});
  try{const p=this.data.page+1,r=await api.call('orders.list',{scope:this.data.scope,page:p});const seen=new Set(this.data.items.map(o=>o.id));this.setData({items:this.data.items.concat(r.items.filter(o=>!seen.has(o.id)).map(ui.order)),page:p,hasMore:r.hasMore});}
  catch(e){ui.error(e);}finally{this.setData({loading:false});}
 },
 open(e){wx.navigateTo({url:'/pages/errand-detail/index?id='+e.currentTarget.dataset.id});},
 create(){wx.navigateTo({url:'/pages/errand-compose/index'});},
 apply(){wx.navigateTo({url:'/pages/runner-apply/index'});}
});
