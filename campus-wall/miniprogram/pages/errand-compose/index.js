const api=require('../../utils/api');
const ui=require('../../utils/ui');
Page({
 data:{title:'',description:'',pickupArea:'',deliveryArea:'',pickupAddress:'',deliveryAddress:'',phone:'',fee:'',deadlineLabels:['1 小时内可接单','2 小时内可接单','6 小时内可接单','24 小时内可接单'],deadlineIndex:1,busy:false},
 onLoad(){this.requestId=api.requestId();api.bootstrap().catch(ui.error);},
 input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value});},
 deadline(e){this.setData({deadlineIndex:Number(e.detail.value)});},
 async submit(){
  if(this.data.busy)return;
  if(!/^\d{1,4}(\.\d{1,2})?$/.test(this.data.fee)){ui.error(new Error('请填写正确金额，最多两位小数'));return;}
  const fields=['title','description','pickupArea','deliveryArea','pickupAddress','deliveryAddress','phone'],data={};
  fields.forEach(k=>data[k]=this.data[k]);
  data.feeCents=Math.round(Number(this.data.fee)*100);
  if(!this.dueAt)this.dueAt=Date.now()+[1,2,6,24][this.data.deadlineIndex]*3600000;
  data.dueAt=this.dueAt;data.requestId=this.requestId;
  this.setData({busy:true});
  try{const r=await api.call('orders.create',data);wx.redirectTo({url:'/pages/errand-detail/index?id='+r.id});}
  catch(e){ui.error(e);}finally{this.setData({busy:false});}
 }
});
