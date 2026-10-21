const api=require('../../utils/api'),ui=require('../../utils/ui');
Page({
 data:{allowed:false,scope:'runners',items:[],page:0,hasMore:false,loading:false,busy:false,error:''},
 async onLoad(){try{const me=await api.bootstrap(true);this.setData({allowed:me.isAdmin});if(me.isAdmin)this.refresh();else this.setData({error:'当前账户没有管理员权限'});}catch(e){this.setData({error:e.message});}},
 async refresh(){if(this.data.loading||!this.data.allowed)return;this.setData({loading:true,error:''});try{const r=await api.call(this.data.scope==='runners'?'admin.runners':'admin.reports',{page:0});this.setData({items:r.items,hasMore:r.hasMore,page:0});}catch(e){this.setData({error:e.message});}finally{this.setData({loading:false});}},
 select(e){if(this.data.loading||this.data.busy)return;this.setData({scope:e.currentTarget.dataset.scope});this.refresh();},
 async more(){if(this.data.loading||!this.data.hasMore)return;this.setData({loading:true});try{const p=this.data.page+1,r=await api.call(this.data.scope==='runners'?'admin.runners':'admin.reports',{page:p});this.setData({items:this.data.items.concat(r.items),hasMore:r.hasMore,page:p});}catch(e){ui.error(e);}finally{this.setData({loading:false});}},
 async review(e){
  if(this.data.busy)return;
  const d=e.currentTarget.dataset;let reason='';
  if(d.decision==='rejected'){
   const result=await new Promise(resolve=>wx.showModal({title:'填写未通过原因',editable:true,placeholderText:'至少两个字符，方便申请人修正',success:resolve,fail:()=>resolve({confirm:false})}));
   if(!result.confirm)return;reason=(result.content||'').trim();if(reason.length<2){ui.error(new Error('请填写至少两个字符的原因'));return;}
  }else if(!await ui.confirm('确认资料已核验，通过该跑腿员申请？'))return;
  this.setData({busy:true});
  try{await api.call('admin.reviewRunner',{id:d.id,decision:d.decision,reason});ui.toast('审核已完成');await this.refresh();}
  catch(err){ui.error(err);}finally{this.setData({busy:false});}
 },
 async resolve(e){if(this.data.busy)return;const d=e.currentTarget.dataset;if(!await ui.confirm(d.decision==='hide'?'确认下架该内容？':'确认已核查此举报并完成处理？'))return;this.setData({busy:true});try{await api.call('admin.resolveReport',{id:d.id,decision:d.decision});ui.toast('已处理');await this.refresh();}catch(err){ui.error(err);}finally{this.setData({busy:false});}}
});
