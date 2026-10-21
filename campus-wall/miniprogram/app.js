const config = require('./config');
App({
  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({ title: '微信版本过低', content: '请升级微信后再使用校园微墙', showCancel: false });
      return;
    }
    if (config.cloudEnv !== 'YOUR_CLOUD_ENV_ID') wx.cloud.init({ env: config.cloudEnv, traceUser: true });
  }
});
