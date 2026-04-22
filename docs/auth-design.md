# 认证与权限设计文档（新库适配版）

## 1. 目标

本文档定义当前服务的登录、鉴权、会话管理、角色权限与关键业务授权规则。

## 2. 认证模型

系统采用双令牌模型：

- accessToken：短期令牌，用于访问受保护接口。
- refreshToken：长期令牌，用于换取新令牌。

二者均为 JWT，并在 `user_login_session` 中保存当前有效值。

## 3. 用户与权限模型

### 3.1 角色定义

- `role=0`：志愿者
- `role=1`：临界少年（预留）
- `role=2`：管理员
- `role=3`：超级管理员

### 3.2 状态定义

- `status=1`：正常
- `status=0`：禁用

账号可用性由 `status` 决定，不再用角色值表示禁用。

### 3.3 鉴权中间件

`requireAuth` 完成以下校验：

1. 校验 Bearer token 格式和 JWT。
2. 校验会话表存在且 `login_status=1`。
3. 校验 accessToken 未过期。
4. 校验 token 用户与会话用户一致。
5. 读取用户并校验 `status=1`。
6. 注入 `req.currentUser` 与 `req.currentSession`。

### 3.4 管理端权限中间件

- `requireAdmin`：允许 `role in (2,3)`。
- `requireSuperAdmin`：仅允许 `role=3`。

## 4. 登录与会话流程

### 4.1 登录流程

1. 前端调用 `wx.login` 获取 `code`。
2. 请求 `POST /api/login/wechat`。
3. 服务端通过微信接口换取 `openid/session_key`。
4. 查找或创建业务用户。
5. 签发 accessToken + refreshToken。
6. 按 `user_id + device_id` 更新或创建会话。
7. 返回用户信息与双令牌。

### 4.2 会话表约束

- 会话表不再存 `openid/unionid`。
- `access_token`、`refresh_token` 均有唯一约束。
- 令牌写库时若发生低概率唯一冲突，服务端自动重试。

### 4.3 刷新流程

1. 前端请求 `POST /api/auth/refresh-token`。
2. 校验 refreshToken 的 JWT 与会话有效性。
3. 生成新双令牌并更新当前会话。
4. 返回新令牌（轮换）。

### 4.4 登出流程

1. 前端请求 `POST /api/auth/logout`。
2. 后端将当前会话 `login_status` 更新为 `2`。
3. 当前会话后续请求被拒绝。

## 5. 用户资料接口

- 昵称：`GET/POST /api/auth/nickname`
- 头像：`GET/POST /api/auth/avatar`
- 志愿者资料：`POST /api/auth/profile`
- 汇总刷新：`POST /api/auth/profile/refresh`

说明：

- 学号 `student_id` 唯一，冲突返回业务错误。
- 志愿者汇总字段为 `volunteer_hours`、`project_count`。

## 6. 项目权限策略

### 6.1 创建与负责人

- `POST /api/admin/projects`：仅超级管理员可创建。
- 创建时必须指定 `responsibleId`。
- 超级管理员可修改负责人：`POST /api/admin/projects/:projectId/responsible`。

### 6.2 启动与结束

- 管理员（role=2）仅可操作自己负责的项目。
- 超级管理员可操作全部项目。
- 开启：仅允许 `0 -> 1`。
- 结束：仅允许 `1 -> 2`，并触发参与记录批处理。

### 6.3 二维码权限

- 签到/签退码仅负责人或超级管理员可生成。
- 负责人不参与扫码签到签退，由系统自动处理。

### 6.4 参与信息导出权限

- `GET /api/admin/projects/:projectId/participants/export`：管理员/超级管理员可访问。
- 超级管理员可导出任意项目。
- 管理员仅可导出自己负责的项目。
- 仅已结束项目（`status=2`）允许导出。

### 6.5 管理员角色管理权限

- `POST /api/admin/admins/:userId/promote`：仅超级管理员可调用，用于将志愿者提升为管理员。
- `POST /api/admin/admins/:userId/demote`：仅超级管理员可调用，用于将管理员降低为志愿者。
- 不允许降低超级管理员；不允许降低当前登录的超级管理员自身。

## 7. 参与记录与结算授权规则

### 7.1 扫码行为

- 志愿者通过 `POST /api/projects/scan` 扫码签到/签退。
- token 一次性消费，消费后失效。
- 记录同时拥有签到与签退时间时立即自动结算。

### 7.2 自动结算规则

- 实际时长 = 签退时间 - 签到时间。
- 向上取整到 0.5 小时。
- 结算时长 = `min(向上取整结果, 项目计划时长)`。
- 首次结算时写入 `settlement_hours`、`is_valid=1`、`note='auto-settlement'`。
- 首次结算才累加 `volunteers.volunteer_hours` 与 `project_count`。

### 7.3 负责人自动参与

- 首个普通志愿者签到时，系统自动为负责人签到。
- 项目结束时，系统自动为负责人签退并参与结算。

### 7.4 项目结束批处理

项目结束后对记录逐条处理：

- 签到+签退且未结算：补结算。
- 仅签到无签退：置无效，`note='未签退'`。
- 仅签退无签到：置无效，`note='签到记录缺失'`。

## 8. 统一申请审批（appeal）

### 8.1 发起申请

- 接口：`POST /api/appeals`
- 可申请对象查询：`GET /api/appeals/targets?type=1|2`
- 我的申请进度：`GET /api/appeals/my?status=all|0|1|2`
- 仅允许为本人参与记录发起。
- 同一参与记录同时仅允许一个待审核申请。
- 同一项目下若已有审核中申请，不允许再发起新的申请。
- 审核员由系统默认使用项目负责人，前端不提供审核员选择。

### 8.2 审核权限

- 期望审核员可审核。
- 超级管理员可兜底审核。

### 8.3 审核结果

- 通过：更新参与记录有效性与结算时长，并在事务内调整志愿者累计时长。
- 拒绝：保留原参与记录，写入审核意见。

### 8.4 管理端接口

- 查询：`GET /api/admin/appeals`
- 支持筛选：`status=all|0|1|2`（不传等同 all）。
- 普通管理员仅查看自己可审核的申请。
- 通过：`POST /api/admin/appeals/:appealId/approve`
- 拒绝：`POST /api/admin/appeals/:appealId/reject`
- 审核通过/拒绝均要求 `reviewComment` 必填。

## 9. 前端联调建议

- 统一拦截器注入 accessToken。
- 40101 时先尝试 refresh，失败后清理登录态。
- `deviceId` 固定持久化，减少会话新增。
- 管理端需按角色区分可见按钮：
  - 仅超级管理员可见创建项目和修改负责人。
  - 普通管理员仅可操作自己负责项目。
- 扫码页需提示负责人不扫码，由系统自动处理。
