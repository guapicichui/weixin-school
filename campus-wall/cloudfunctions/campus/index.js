'use strict';
const cloud = require('wx-server-sdk');
const crypto = require('node:crypto');
const { makeService } = require('./service');
const { AppError } = require('./policy');
const { makeRepository } = require('./repository');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const service = makeService({
  store: makeRepository(db),
  hash: value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 32),
  schoolId: process.env.SCHOOL_ID || 'default-school',
  schoolName: process.env.SCHOOL_NAME || '我的校园',
  adminOpenids: (process.env.ADMIN_OPENIDS || '').split(',').map(s => s.trim()).filter(Boolean),
  moderate: async (content, openid) => {
    if (process.env.CONTENT_CHECK_ENABLED === 'false') return;
    try {
      const result = await cloud.openapi.security.msgSecCheck({ content, version: 2, scene: 2, openid });
      if (!result.result || result.result.suggest !== 'pass') {
        const error = new Error('内容未通过检查，请调整后再提交');
        error.code = 'CONTENT_REJECTED'; throw error;
      }
    } catch (error) {
      if (error.code === 'CONTENT_REJECTED') throw error;
      console.error('content_check_failed', error.errCode || error.code || 'unknown');
      const unavailable = new Error('内容检查暂不可用，请稍后重试');
      unavailable.code = 'CONTENT_CHECK_UNAVAILABLE'; throw unavailable;
    }
  }
});
exports.main = async event => {
  try {
    const context = cloud.getWXContext();
    const data = await service.execute(event && event.action, event && event.data || {}, { openid: context.OPENID });
    return { ok: true, data };
  } catch (error) {
    const expected = error instanceof AppError || ['CONTENT_REJECTED', 'CONTENT_CHECK_UNAVAILABLE'].includes(error.code);
    if (!expected) console.error('campus_request_failed', error);
    return { ok: false, error: { code: expected ? error.code : 'INTERNAL_ERROR', message: expected ? error.message : '服务暂不可用，请稍后重试' } };
  }
};
