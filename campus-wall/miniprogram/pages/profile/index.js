const api=require('../../utils/api'),ui=require('../../utils/ui');
Page({
 data:{user:null,school:'',isAdmin:false,runnerLabel:'尚未申请',error:''},
 onShow(){this.refresh();},
 async refresh(){this.setData({error:''});try{const me=await api.bootstrap(true);const labels={none:'尚未申请',pending:'审核中',approved:'已通过审核',rejected:'未通过审核'};this.setData({user:Object.assign({},me.user,{initial:me.user.nickname.slice(0,1)}),school:me.school.name,isAdmin:me.isAdmin,runnerLabel:labels[me.user.runnerStatus]||'尚未申请'});}catch(e){this.setData({error:e.message});}},
 navigate(e){wx.navigateTo({url:e.currentTarget.dataset.url});},
 async identity(){try{const r=await api.call('profile.identity');wx.setClipboardData({data:r.openid});}catch(e){ui.error(e);}}
});
