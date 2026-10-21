# 云函数 API

唯一业务函数：campus。

~~~js
const res = await wx.cloud.callFunction({
  name: 'campus',
  data: {
    action: 'posts.list',
    data: { page: 0, topic: '学习交流' }
  }
})
~~~

成功：{ ok: true, data: ... }

失败：{ ok: false, error: { code, message } }

身份仅由云函数上下文决定。分页参数 page 从 0 开始；列表响应通常为 { items, hasMore }。

| action | 参数 | 说明 |
|---|---|---|
| profile.identity | 无 | 当前调用者 OpenID 和内部 ID，供管理员设置使用 |
| profile.me | 无 | 自动建立账号并返回资料、话题、学校、审核状态 |
| profile.save | nickname、bio | 更新自己的资料 |
| posts.list | page、topic?、scope? | scope 为 mine、favorites 或默认全部 |
| posts.get | id | 帖子详情及自己的点赞收藏状态 |
| posts.create | title、content、topic、requestId | 发布文字帖子 |
| posts.remove | id | 作者或管理员删除帖子 |
| posts.react | id、kind、active | kind 为 like 或 favorite；active 为布尔值 |
| comments.list | postId、page | 评论分页 |
| comments.create | postId、content、requestId | 评论并通知帖子作者 |
| comments.remove | id | 作者或管理员删除评论 |
| runner.apply | realName、studentNo、phone、agreed | 提交跑腿申请，agreed 必须为 true |
| orders.list | page、scope? | 默认大厅；mine 为我发的，accepted 为我接的 |
| orders.get | id | 订单详情，私密字段按参与者角色返回 |
| orders.create | 见下表 | 发布线下结算的跑腿需求 |
| orders.transition | id、transition | accept、deliver、complete、cancel |
| notifications.list | page | 自己的站内通知 |
| notifications.read | id | 标记自己的通知为已读 |
| reports.create | targetType、targetId、reason | 举报 post、comment、order |
| admin.runners | page | 待审核跑腿申请 |
| admin.reviewRunner | id、decision、reason? | approved / rejected；拒绝时必须填说明 |
| admin.reports | page | 待处理举报与原内容摘要 |
| admin.resolveReport | id、decision | dismiss 结案；hide 下架帖子或评论 |

orders.create 参数：

| 字段 | 含义 |
|---|---|
| title / description | 需求标题和公开说明 |
| pickupArea / deliveryArea | 公开的取件与送达区域 |
| pickupAddress / deliveryAddress | 参与者可见的详细地址 |
| phone | 发单人手机号 |
| feeCents | 整数分，100–100000 |
| dueAt | 接单截止时间，毫秒时间戳，未来七天内 |
| requestId | 12–80 位字母、数字、下划线或短横线 |

SDK 调用需先完成 wx.cloud.init，并保证小程序与环境已关联。前端 utils/api.js 会先完成账号建立，再发送业务请求。

主要错误码：UNAUTHENTICATED、FORBIDDEN、INVALID_INPUT、NOT_FOUND、RUNNER_REQUIRED、ORDER_UNAVAILABLE、ORDER_EXPIRED、INVALID_STATE、TOO_FAST、CONTENT_REJECTED、CONTENT_CHECK_UNAVAILABLE、INTERNAL_ERROR。
