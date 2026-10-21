const config = require('../config');
let session;
let sessionPromise;
async function invoke(action, data) {
  if (!wx.cloud || config.cloudEnv === 'YOUR_CLOUD_ENV_ID') throw new Error('请先在 config.js 配置云环境 ID，并部署 campus 云函数');
  const response = await wx.cloud.callFunction({ name: config.functionName, data: { action, data: data || {} } });
  const result = response.result;
  if (!result || result.ok !== true) {
    const error = new Error(result && result.error && result.error.message || '服务暂不可用');
    error.code = result && result.error && result.error.code;
    throw error;
  }
  return result.data;
}
async function bootstrap(force) {
  if (force) session = null;
  if (session) return session;
  if (!sessionPromise) {
    sessionPromise = invoke('profile.me').then(result => { session = result; return result; }).finally(() => { sessionPromise = null; });
  }
  return sessionPromise;
}
async function call(action, data) {
  if (action !== 'profile.me' && action !== 'profile.identity') await bootstrap();
  return invoke(action, data);
}
function invalidate() { session = null; }
function requestId() { return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12); }
module.exports = { call, bootstrap, invalidate, requestId };
