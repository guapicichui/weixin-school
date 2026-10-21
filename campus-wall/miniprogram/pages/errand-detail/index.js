const api=require('../../utils/api');
const ui=require('../../utils/ui');
Page({
 data:{order:null,busy:false,error:'',runnerStatus:'none'},
 onLoad(options){this.id=options.id;this.refresh();},
 async refresh(){
  this.setData({error:''});
  try{const me=await api.bootstrap(true),order=await api.call('orders.get',{id:this.id});this.setData({order:ui.order(order),runnerStatus:me.user.runnerStatus});}
  catch(e){this.setData({error:e.message});}
 },
 async transition(e){
  if(this.data.busy)return;
  const transition=e.currentTarget.dataset.transition;
  const prompts={accept:'确认接取此单？接单后将获取详细地址和联系方式。',deliver:'确认物品已送达约定地点？',complete:'确认本次跑腿已完成？请自行确认线下结算。',cancel:'确认取消这个尚未被接取的订单？'};
  if(!await ui.confirm(prompts[transition]))return;
  this.setData({busy:true});
  try{const result=await api.call('orders.transition',{id:this.id,transition});this.setData({order:ui.order(result)});ui.toast('操作成功');}
  catch(err){ui.error(err);await this.refresh();}finally{this.setData({busy:false});}
 },
 phone(e){const phone=e.currentTarget.dataset.phone;if(phone)wx.makePhoneCall({phoneNumber:phone});},
 apply(){wx.navigateTo({url:'/pages/runner-apply/index'});},
 async report(){const p=await ui.report('order',this.id);if(!p)return;try{await api.call('reports.create',p);ui.toast('举报已提交');}catch(e){ui.error(e);}}
});
