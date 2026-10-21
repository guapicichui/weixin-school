const api = require('../../utils/api');
const ui = require('../../utils/ui');
Page({
 data:{ title:'', content:'', topics:[], topic:'', busy:false },
 onLoad(){ this.requestId=api.requestId(); this.init(); },
 async init(){try{const me=await api.bootstrap();this.setData({topics:me.topics,topic:me.topics[0]});}catch(e){ui.error(e);}},
 input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value});},
 chooseTopic(e){this.setData({topic:this.data.topics[Number(e.detail.value)]});},
 async submit(){
  if(this.data.busy)return;
  if(!this.data.title.trim()||!this.data.content.trim()){ui.error(new Error('请填写标题和正文'));return;}
  this.setData({busy:true});
  try{const result=await api.call('posts.create',{title:this.data.title,content:this.data.content,topic:this.data.topic,requestId:this.requestId});wx.redirectTo({url:'/pages/post-detail/index?id='+result.id});}
  catch(e){ui.error(e);}finally{this.setData({busy:false});}
 }
});
