const api=require('../../utils/api'),ui=require('../../utils/ui');
Page({
 data:{nickname:'',bio:'',busy:false,ready:false},
 async onLoad(){try{const r=await api.bootstrap();this.setData({nickname:r.user.nickname,bio:r.user.bio,ready:true});}catch(e){ui.error(e);}},
 input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value});},
 async save(){if(this.data.busy||!this.data.ready)return;this.setData({busy:true});try{await api.call('profile.save',{nickname:this.data.nickname,bio:this.data.bio});api.invalidate();wx.navigateBack();}catch(e){ui.error(e);}finally{this.setData({busy:false});}}
});
