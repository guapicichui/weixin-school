# 数据模型与权限

部署方式：一个微信云开发环境对应一个学校，支持多个微信用户。默认不做跨学校统一租户系统。

## 集合

| 集合 | 主键 | 核心字段 | 可见范围 |
|---|---|---|---|
| users | OpenID 的 SHA-256 派生 ID | schoolId、nickname、bio、runnerStatus、频率限制时间 | 自己的资料；公开内容仅附带昵称和内部 ID |
| posts | 用户 ID + requestId 派生 ID | title、content、topic、authorId、status、计数 | 本校已发布帖子 |
| comments | 用户 ID + requestId 派生 ID | postId、authorId、content、status | 本校已发布帖子的评论 |
| likes | 用户 ID + 帖子 ID 派生 ID | userId、postId、active | 经云函数返回自己的点赞状态 |
| favorites | 用户 ID + 帖子 ID 派生 ID | userId、postId、active | 仅自己的收藏列表 |
| runnerApplications | 用户 ID | realName、studentNo、phone、status、reason | 管理员；本人只取得审核状态和说明 |
| orders | 用户 ID + requestId 派生 ID | 区域、详细地址、联系电话、feeCents、状态、双方 ID | 大厅返回公开摘要；联系方式和详细地址仅参与者取得 |
| notifications | 事件 + 接收者派生 ID | recipientId、targetType、targetId、read | 仅接收者 |
| reports | 举报人 + 类型 + 对象派生 ID | reporterId、reason、status、处理结果 | 管理员处理；举报人提交 |

客户端数据库权限全部关闭。云函数 SDK 的数据库权限不会自动继承客户端规则，因此业务层逐个操作检查调用者、学校、文档归属和订单角色。

## 身份

- 从微信云函数运行上下文读取 OPENID。
- 不接受请求体中的 openid、ownerId、runnerId、isAdmin 等字段作为权限依据。
- 用户 ID 使用 SHA-256 派生，公开帖子不会返回作者的原始 OpenID。
- profile.identity 仅向本人返回自己的 OpenID，用于部署者设置管理员。
- 用户昵称是快照：发帖或评论时保存昵称，修改个人资料不会回写历史内容。

## 订单状态

| 当前状态 | 操作 | 授权角色 | 结果 |
|---|---|---|---|
| waiting | accept | 审核通过的其他跑腿员，且未过截止时间 | accepted |
| waiting | cancel | 发单人 | cancelled |
| accepted | deliver | 本单跑腿员 | delivered |
| delivered | complete | 发单人 | completed |

接单、状态更新和通知写入在数据库事务中完成。两个跑腿员同时接单，只有一个事务能将 waiting 状态改为 accepted。

已接订单的修改或取消需要双方协商、由运营处理；本版不提供绕过参与者角色的任意订单状态修改接口。

金额使用整数分，允许 100–100000 分。订单结算字段固定为 offline。

## 幂等与计数

- 帖子、评论、订单使用 requestId 派生稳定 ID，同一次提交重试不会重复创建。
- 点赞和收藏设置明确的 active 状态，不使用重复点击就反转的接口。
- 评论数、点赞数及对应记录在事务中同步更新。
- 站内通知与对应业务状态在同一事务中提交。
- 列表每页 20 条，查询 21 条判断 hasMore；客户端做 ID 去重。

## 文字与审核

文字发布和资料更新经服务端 msgSecCheck；管理员还可处理举报并下架帖子或评论。跑腿申请由管理员人工核验姓名、学号和电话。学校官方身份认证需要另行对接真实认证服务。
