# 部署指南

## 1. 准备

- 已注册的微信小程序 AppID；体验账号的权限与正式账号可能不同。
- 微信开发者工具。
- 与小程序关联的微信云开发环境。
- 一个管理员微信账号，以及至少两个用于验收的普通账号。

导入 campus-wall 目录，将项目 AppID 改成自己的小程序 AppID。在 miniprogram/config.js 将 YOUR_CLOUD_ENV_ID 替换为实际环境 ID。该项目使用微信内置 wx.cloud，不使用独立 CloudBase Web SDK 的自定义登录路径。

## 2. 创建数据库集合

在微信云开发控制台创建下列 10 个**文档型集合**：

~~~text
users
posts
comments
likes
favorites
runnerApplications
orders
notifications
reports
~~~

业务集合清单也定义在 cloudfunctions/campus/service.js 的 COLLECTIONS 中，代码为最终依据。

将每个集合的客户端读写权限设置为自定义规则：

~~~json
{
  "read": false,
  "write": false
}
~~~

所有业务均经云函数访问数据库；客户端无需直接读写数据库。不要为调试把集合改成所有用户可读写。

数据库集合不存在、索引错误或云环境配置错误会令相应接口失败。请先完成集合与规则配置，再使用小程序。

## 3. 部署云函数

在微信开发者工具的 cloudfunctions/campus 上右键：

“上传并部署：云端安装依赖”。

函数名称必须为 campus，或同步调整 miniprogram/config.js 的 functionName。后端使用 wx-server-sdk 和文档数据库事务。选择支持 Node.js 18 或更新版本的运行环境。

config.json 声明了 security.msgSecCheck 权限。根据小程序类目和平台要求开通对应接口权限。

在云函数配置页设置：

| 环境变量 | 含义 | 默认值 |
|---|---|---|
| SCHOOL_ID | 当前学校的稳定标识 | default-school |
| SCHOOL_NAME | 页面显示的学校名称 | 我的校园 |
| ADMIN_OPENIDS | 管理员 OpenID，多个值以英文逗号隔开 | 空，无管理员 |
| CONTENT_CHECK_ENABLED | 文字内容检查；仅显式设为 false 时关闭 | 开启 |

文字内容检查默认开启，检查失败或接口不可用时不会写入帖子、评论和资料更新。CONTENT_CHECK_ENABLED=false 仅用于联调环境；正式环境应启用并完成检查接口配置。

同一环境开始使用后，保持 SCHOOL_ID 稳定。若为另一个学校部署，创建另一个环境，避免复用同一批用户和业务文档。

## 4. 配置管理员

部署函数并关联云环境后，在微信开发者工具的小程序调试控制台执行：

~~~js
wx.cloud.callFunction({
  name: 'campus',
  data: { action: 'profile.identity', data: {} }
}).then(res => console.log(res.result))
~~~

仅返回当前调用者自己的 OpenID 和内部用户 ID。将返回的 openid 配置到 ADMIN_OPENIDS，并使云函数配置生效。

管理员进入小程序“我的”，会看到“校园管理”。若没有入口，检查 ADMIN_OPENIDS、当前微信账号、云函数配置是否已更新。

不要通过客户端参数指定管理员身份或修改数据库角色。服务端只使用 cloud.getWXContext().OPENID 和部署者配置的管理员名单。

## 5. 配置索引

按 docs/database-indexes.json 的字段顺序在控制台创建查询所需的复合索引。该文件是人工操作参考，不是云开发 CLI 的自动导入文件。

comments 使用 createdAt、_id 升序，其余分页列表按创建时间与 ID 降序。订单大厅还按 dueAt 做范围过滤；若控制台提示需要不同组合，请按实际查询及控制台提示配置范围字段索引。

## 6. 真机联调

确保测试账号有开发者或体验成员权限：

- A 账号修改资料，发布帖子和跑腿需求。
- B 账号点赞、评论，提交跑腿员申请。
- 管理员核验 B 账号资料并通过审核。
- B 账号接单并确认送达，A 账号确认完成。
- C 账号验证无法获得未参与订单的联系方式、无法操作他人订单。

详见 VALIDATION.md。

## 7. 上传审核与发布

在微信开发者工具上传版本，再在公众平台设置体验版、提交审核和正式发布。云函数与数据库需要先在实际使用的云环境中部署。

发布小程序前，应将实际采集的数据、用途和权限反映到隐私保护指引中，并完成平台要求的小程序备案、类目资质和相关资料。微信平台审核、学校核验与支付接入不由本仓库源码自动完成。
