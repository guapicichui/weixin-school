const api=require('../../utils/api'),ui=require('../../utils/ui');
Page({
 data:{status:'none',reason:'',realName:'',studentNo:'',phone:'',agreed:false,busy:false,ready:false},
 onShow(){this.refresh();},
 async refresh(){try{const me=await api.bootstrap(true);this.setData({status:me.user.runnerStatus,reason:me.runnerApplication&&me.runnerApplication.reason||'',ready:true});}catch(e){ui.error(e);}},
 input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value});},
 agree(e){this.setData({agreed:e.detail.value.includes('agree')});},
 async submit(){if(this.data.busy||!this.data.ready)return;this.setData({busy:true});try{await api.call('runner.apply',{realName:this.data.realName,studentNo:this.data.studentNo,phone:this.data.phone,agreed:this.data.agreed});api.invalidate();await this.refresh();ui.toast('申请已提交');}catch(e){ui.error(e);}finally{this.setData({busy:false});}}
});
