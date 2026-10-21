const api=require('../../utils/api');
const ui=require('../../utils/ui');
Page({
 data:{post:null,comments:[],content:'',busy:false,reacting:false,loading:false,error:'',page:0,hasMore:false},
 onLoad(options){this.id=options.id;this.commentId=api.requestId();this.refresh();},
 async refresh(){
  this.setData({loading:true,error:''});
  try{
   const result=await api.call('posts.get',{id:this.id});
   const comments=await api.call('comments.list',{postId:this.id,page:0});
   this.setData({post:ui.post(result),comments:comments.items.map(c=>Object.assign({},c,{time:ui.date(c.createdAt)})),page:0,hasMore:comments.hasMore});
  }catch(e){this.setData({error:e.message});}finally{this.setData({loading:false});}
 },
 input(e){this.setData({content:e.detail.value});},
 async react(e){
  if(this.data.reacting||!this.data.post)return;
  const kind=e.currentTarget.dataset.kind,field=kind==='like'?'liked':'favorited';
  this.setData({reacting:true});
  try{const r=await api.call('posts.react',{id:this.id,kind,active:!this.data.post[field]});this.setData({['post.'+field]:r.active,'post.likeCount':r.likeCount});}
  catch(err){ui.error(err);}finally{this.setData({reacting:false});}
 },
 async comment(){
  if(this.data.busy||!this.data.content.trim())return;
  this.setData({busy:true});
  try{await api.call('comments.create',{postId:this.id,content:this.data.content,requestId:this.commentId});this.commentId=api.requestId();this.setData({content:''});await this.refresh();}
  catch(e){ui.error(e);}finally{this.setData({busy:false});}
 },
 async more(){
  if(this.data.loading||!this.data.hasMore)return;
  this.setData({loading:true});
  try{const p=this.data.page+1,r=await api.call('comments.list',{postId:this.id,page:p});const seen=new Set(this.data.comments.map(c=>c.id));this.setData({comments:this.data.comments.concat(r.items.filter(c=>!seen.has(c.id)).map(c=>Object.assign({},c,{time:ui.date(c.createdAt)}))),page:p,hasMore:r.hasMore});}
  catch(e){ui.error(e);}finally{this.setData({loading:false});}
 },
 async remove(){
  if(!await ui.confirm('确定删除这条动态吗？'))return;
  try{await api.call('posts.remove',{id:this.id});wx.navigateBack();}catch(e){ui.error(e);}
 },
 async removeComment(e){
  if(!await ui.confirm('确定删除这条评论吗？'))return;
  try{await api.call('comments.remove',{id:e.currentTarget.dataset.id});await this.refresh();}catch(err){ui.error(err);}
 },
 async report(e){
  const d=e.currentTarget.dataset,params=await ui.report(d.type,d.id);
  if(!params)return;
  try{await api.call('reports.create',params);ui.toast('举报已提交');}catch(err){ui.error(err);}
 }
});
