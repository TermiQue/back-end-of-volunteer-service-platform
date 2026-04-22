# API 文档（前端联调详细版）

## 1. 概览

- Base URL: `/api`
- Content-Type: `application/json`
- 鉴权方式: Bearer Token
- 受保护接口统一 Header:

```http
Authorization: Bearer <accessToken>
```

说明:

- 业务错误默认也使用 HTTP 200 返回，错误码在响应体 `code` 中。
- 仅极少数网关/中间件错误会返回 4xx/5xx。

---

## 2. 通用响应结构

### 2.1 成功响应

```json
{
  "code": 0,
  "message": "操作成功",
  "data": {}
}
```

### 2.2 失败响应

```json
{
  "code": 40001,
  "message": "参数错误",
  "details": null
}
```

### 2.3 错误码

| code | 含义 | 前端建议 |
| --- | --- | --- |
| 0 | 成功 | 正常处理 |
| 40001 | 参数错误/业务状态非法 | 直接 toast 提示 |
| 40101 | 未登录/令牌无效/过期 | 尝试 refresh，失败则跳登录 |
| 40301 | 权限不足/账号禁用/会话失效 | 直接提示并回退页面 |
| 40302 | refreshToken 过期 | 清理登录态并跳登录 |
| 40401 | 资源不存在 | 提示“数据不存在或已删除” |
| 50000 | 服务端错误 | 提示“系统繁忙，请稍后重试” |

---

## 3. 枚举与字段约定

### 3.1 用户角色

| 值 | 含义 |
| --- | --- |
| 0 | 志愿者 |
| 1 | 临界少年（预留） |
| 2 | 管理员 |
| 3 | 超级管理员 |

### 3.2 用户状态

| 值 | 含义 |
| --- | --- |
| 1 | 正常 |
| 0 | 禁用 |

### 3.3 项目状态

| 值 | 含义 |
| --- | --- |
| 0 | 未开启 |
| 1 | 进行中 |
| 2 | 已结束 |

### 3.4 参与记录关键字段

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| is_valid | number | 1 有效，0 无效 |
| settlement_hours | string/number/null | 结算时长（小时，0.5 精度） |
| note | string/null | 备注（自动结算/未签退/审批说明） |

### 3.5 分页字段

| 字段 | 类型 | 默认 | 上限 |
| --- | --- | --- | --- |
| page | number | 1 | - |
| pageSize | number | 20 | 100 |

---

## 4. 鉴权相关接口

## 4.1 微信登录

- Method: `POST`
- Path: `/api/login/wechat`
- 鉴权: 否

请求体:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| code | string | 是 | 小程序 `wx.login` 返回 code |
| deviceId | string | 否 | 设备标识（也兼容 device_id） |
| deviceType | number | 否 | 设备类型（也兼容 device_type） |

请求示例:

```json
{
  "code": "wx-code-xxx",
  "deviceId": "miniapp-ios-001",
  "deviceType": 1
}
```

成功响应示例:

```json
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "user": {
      "userId": 101,
      "nickname": "微信用户101",
      "avatarUrl": "",
      "role": 0
    }
  }
}
```

---

## 4.2 获取当前用户

- Method: `GET`
- Path: `/api/auth/me`
- 鉴权: 是

说明:

- `role=0/2/3`：返回志愿者 profile。
- `role=1`：返回占位 profile。
- profile 中不再包含 `reviewing_count`。

成功响应示例:

```json
{
  "code": 0,
  "message": "获取成功",
  "data": {
    "user": {
      "userId": 101,
      "nickname": "张三",
      "avatarUrl": "/api/auth/avatar",
      "role": 2,
      "profile": {
        "user_id": 101,
        "name": "张三",
        "student_id": "20230001",
        "phone": "13800000000",
        "volunteer_hours": "12.5",
        "project_count": 4
      }
    }
  }
}
```

---

## 4.3 刷新令牌

- Method: `POST`
- Path: `/api/auth/refresh-token`
- 鉴权: 否（传 refreshToken）

请求体:

```json
{
  "refreshToken": "..."
}
```

成功响应:

```json
{
  "code": 0,
  "message": "刷新成功",
  "data": {
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

---

## 4.4 登出

- Method: `POST`
- Path: `/api/auth/logout`
- 鉴权: 是

成功响应:

```json
{
  "code": 0,
  "message": "登出成功",
  "data": null
}
```

---

## 5. 个人资料接口

## 5.1 获取昵称

- Method: `GET`
- Path: `/api/auth/nickname`
- 鉴权: 是

## 5.2 更新昵称

- Method: `POST`
- Path: `/api/auth/nickname`
- 鉴权: 是

请求体:

```json
{
  "nickname": "新的昵称"
}
```

---

## 5.3 上传头像

- Method: `POST`
- Path: `/api/auth/avatar`
- 鉴权: 是
- Content-Type: `multipart/form-data`

表单字段:

| 字段 | 类型 | 必填 |
| --- | --- | --- |
| avatar | file | 是 |

返回用户结构与 `auth/me` 中 user 结构一致。

## 5.4 获取头像文件

- Method: `GET`
- Path: `/api/auth/avatar`
- 鉴权: 是
- 响应: 二进制图片

---

## 5.5 创建/更新志愿者资料

- Method: `POST`
- Path: `/api/auth/profile`
- 鉴权: 是

请求体:

```json
{
  "name": "张三",
  "studentId": "20230001",
  "phone": "13800000000"
}
```

业务规则:

- `studentId` 全局唯一。
- 学号重复返回 `code=40001`，message 为“学号已存在”。

---

## 5.6 刷新志愿者汇总

- Method: `POST`
- Path: `/api/auth/profile/refresh`
- 鉴权: 是

说明:

- 基于参与记录重算 `volunteer_hours` 与 `project_count`。

---

## 6. 志愿者端项目接口

## 6.1 查询我参与的项目

- Method: `GET`
- Path: `/api/auth/projects`
- 鉴权: 是

Query 参数:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| projectStatus | number | 否 | 项目状态筛选 0/1/2 |
| page | number | 否 | 页码 |
| pageSize | number | 否 | 每页数量 |

返回字段重点:

- 参与记录: `check_in_at`、`check_out_at`、`is_valid`、`settlement_hours`、`note`
- 项目字段: `project_status`、`created_by_id`、`responsible_id`

---

## 6.2 扫码签到/签退

- Method: `POST`
- Path: `/api/projects/scan`
- 鉴权: 是

请求体:

```json
{
  "token": "qr-token"
}
```

返回字段:

| 字段 | 说明 |
| --- | --- |
| action | `checked_in` / `already_checked_in` / `checked_out` / `already_checked_out` |
| projectId | 项目 ID |
| participant | 当前用户参与记录 |

业务规则:

- token 一次性消费。
- 同一动作重复扫码幂等返回，不覆盖原时间。
- 负责人（`responsible_id`）不允许扫码，会提示自动签到签退。
- 当同一记录具备签到+签退时间时，系统即时结算。

即时结算规则:

1. 实际时长 = 签退 - 签到。
2. 向上取整到 0.5 小时。
3. 最终时长 = min(向上取整结果, 项目 `duration_hours`)。
4. 首次结算写入:
   - `is_valid=1`
   - `settlement_hours=<计算结果>`
   - `note='auto-settlement'`
5. 首次结算才累计到 `volunteer_hours` 与 `project_count`。

---

## 6.3 发起申请（appeal）

- Method: `POST`
- Path: `/api/appeals`
- 鉴权: 是

请求体:

```json
{
  "participantId": 9001,
  "time": 2.5,
  "reason": "当日提前到场，申请修正时长"
}
```

字段说明:

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| participantId | 是 | 参与记录 ID，只能提交自己的记录 |
| time | 是 | 期望时长（小时，最多 1 位小数） |
| reason | 是 | 申请理由 |

说明:

- 审核员由系统默认取项目负责人，前端不需要也不应传 `expectedReviewerId`。

---

## 6.4 查询可申请对象

- Method: `GET`
- Path: `/api/appeals/targets`
- 鉴权: 是

Query 参数:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| type | number | 否 | 申请类型筛选：`1` 无效记录申诉，`2` 时长变更 |

返回字段重点:

- `items[].type`: 申请类型（`1/2`）
- `items[].participantId`: 可提交申请的参与记录 ID（用于后续提交）
- `items[].hasPendingAppeal`: 是否已有待审核申请
- `items[].project`: 项目信息（含 `responsibleId`）
- `items[].participant`: 参与记录关键信息（`isValid`、`settlementHours`、签到签退、`note`）

业务规则:

- `is_valid=0` 的记录发起“申诉”。
- `is_valid=1` 且已有 `settlement_hours` 的记录发起“时长变更”。
- 同一参与记录仅允许一个待审核申请。
- 同一项目下若已有“审核中”申请，不允许再发起新的申请。

---

## 6.5 查看我的审核进度

- Method: `GET`
- Path: `/api/appeals/my`
- 鉴权: 是

Query 参数:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| status | string/number | 否 | `all` 或不传=全部；`0` 审核中，`1` 通过，`2` 拒绝 |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页数量，默认 20，上限 100 |

返回字段重点:

- `items`: 当前用户发起的申请列表
- 每项含申请主信息、关联项目信息、审核信息（`status/review_comment/review_time`）

---

## 7. 管理端接口

权限基线:

- 管理端路由统一需要已登录 + `role in (2,3)`。
- 部分接口仅超级管理员可用。

## 7.1 查询项目

- Method: `GET`
- Path: `/api/admin/projects`
- 权限: 管理员/超级管理员

Query 参数:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| projectId | number | 项目 ID |
| name | string | 名称模糊 |
| startTimeFrom/startTimeTo | string | 开始时间范围 |
| endTimeFrom/endTimeTo | string | 结束时间范围 |
| durationHoursMin/durationHoursMax | number | 时长范围 |
| status | number | 0/1/2 |
| createdById | number | 创建者 |
| responsibleId | number | 负责人 |
| createdTimeFrom/createdTimeTo | string | 创建时间范围 |
| page/pageSize | number | 分页 |

---

## 7.2 创建项目（超级管理员）

- Method: `POST`
- Path: `/api/admin/projects`
- 权限: 仅超级管理员

请求体:

```json
{
  "name": "社区义诊",
  "description": "周末志愿服务",
  "startTime": "2026-05-01T09:00:00+08:00",
  "endTime": "2026-05-01T12:00:00+08:00",
  "durationHours": 3,
  "responsibleId": 2001
}
```

校验:

- `endTime > startTime`
- `responsibleId` 必须是有效管理员或超级管理员

---

## 7.3 修改项目负责人（超级管理员）

- Method: `POST`
- Path: `/api/admin/projects/:projectId/responsible`
- 权限: 仅超级管理员

请求体:

```json
{
  "responsibleId": 2002
}
```

规则:

- 已结束项目（`status=2`）不允许变更负责人。

---

## 7.4 开启项目

- Method: `POST`
- Path: `/api/admin/projects/:projectId/start`
- 权限:
  - 超级管理员可操作任意项目
  - 普通管理员仅可操作自己负责项目

状态机:

- 允许: `0 -> 1`
- 拒绝: `1 -> 1`, `2 -> 1`

---

## 7.5 结束项目

- Method: `POST`
- Path: `/api/admin/projects/:projectId/end`
- 权限同开启

状态机:

- 允许: `1 -> 2`
- 拒绝: `0 -> 2`, `2 -> 2`

项目结束批处理:

1. 自动为负责人补签到（若缺失）。
2. 自动为负责人按项目结束时间签退。
3. 遍历参与记录:
   - 签到+签退: 补结算（若未结算）
   - 仅签到: 标记无效，`note='未签退'`
   - 仅签退: 标记无效，`note='签到记录缺失'`

---

## 7.6 获取签到二维码

- Method: `GET`
- Path: `/api/admin/projects/:projectId/qr/checkin`
- 权限: 负责人或超级管理员

## 7.7 获取签退二维码

- Method: `GET`
- Path: `/api/admin/projects/:projectId/qr/checkout`
- 权限: 负责人或超级管理员

二维码规则:

- 同一项目同类型若有未消费 token，重复获取返回同一个。
- token 被扫码消费后，再次获取会生成新 token。

---

## 7.8 查询志愿者列表

- Method: `GET`
- Path: `/api/admin/volunteers`
- 权限: 管理员/超级管理员

Query 参数:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| name | string | 姓名模糊 |
| studentId | string | 学号模糊 |
| volunteerHoursMin/volunteerHoursMax | number | 时长范围 |
| projectCountMin/projectCountMax | number | 项目数范围 |
| page/pageSize | number | 分页 |

---

## 7.9 查询单个志愿者详情

- Method: `GET`
- Path: `/api/admin/volunteers/:userId`
- 权限: 管理员/超级管理员

返回:

- `volunteer`: 志愿者基础信息
- `projects`: 全部参与记录（不分页）

---

## 7.10 查询管理员列表（超级管理员）

- Method: `GET`
- Path: `/api/admin/admins`
- 权限: 仅超级管理员

返回字段:

- `user_id`
- `name`
- `student_id`
- `role`
- `status`

---

## 7.11 提升志愿者为管理员（超级管理员）

- Method: `POST`
- Path: `/api/admin/admins/:userId/promote`
- 权限: 仅超级管理员

规则:

- 仅可提升非管理员、非超级管理员用户。
- 目标用户必须存在且状态正常。

返回:

- `user`: 更新后的用户信息（`user_id`、`nickname`、`avatar_url`、`role`、`status`）

---

## 7.12 降低管理员为志愿者（超级管理员）

- Method: `POST`
- Path: `/api/admin/admins/:userId/demote`
- 权限: 仅超级管理员

规则:

- 仅可降低普通管理员（`role=2`），不可降低超级管理员。
- 不可降低当前登录的超级管理员自身。
- 目标用户必须存在且状态正常。

返回:

- `user`: 更新后的用户信息（`user_id`、`nickname`、`avatar_url`、`role`、`status`）

---

## 7.13 导出项目参与信息 Excel

- Method: `GET`
- Path: `/api/admin/projects/:projectId/participants/export`
- 权限: 管理员/超级管理员

权限差异:

- 超级管理员: 可导出任意项目。
- 管理员: 仅可导出自己负责的项目。

响应:

- 返回 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` 文件流。
- 文件名规则: `项目名_项目id_时间戳.xlsx`。

Excel 说明:

- 表头固定为: `姓名`、`*学号`、`*时长/h`
- 数据来源:
  - `姓名`: 基本信息表 `volunteers.name`
  - `*学号`: 基本信息表 `volunteers.student_id`（单元格格式为文本）
  - `*时长/h`: 参与记录结算时长 `volunteer_project_participants.settlement_hours`（展示为整数或 `x.5`）

---

## 7.14 查询申请列表

- Method: `GET`
- Path: `/api/admin/appeals`
- 权限: 管理员/超级管理员

Query 参数:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| status | string/number | `all` 或不传=全部；`0` 待审核，`1` 通过，`2` 拒绝 |
| participantId | number | 参与记录 ID |
| applicantId | number | 申请人 ID |
| expectedReviewerId | number | 期望审核员 |
| page/pageSize | number | 分页 |

权限差异:

- 普通管理员: 仅能看到自己负责审核的申请。
- 超级管理员: 可看到全部。

---

## 7.15 审核通过申请

- Method: `POST`
- Path: `/api/admin/appeals/:appealId/approve`
- 权限: 期望审核员或超级管理员

请求体:

```json
{
  "reviewComment": "核实通过"
}
```

规则:

- `reviewComment` 必填。

通过后行为:

1. 申请状态改为通过。
2. 参与记录更新为有效并写入新 `settlement_hours`。
3. 事务内调整志愿者累计时长:
   - 原本有效: 先减旧时长再加新时长（差值更新）
   - 原本无效: 直接新增新时长并项目计数+1

---

## 7.16 审核拒绝申请

- Method: `POST`
- Path: `/api/admin/appeals/:appealId/reject`
- 权限: 期望审核员或超级管理员

请求体:

```json
{
  "reviewComment": "证据不足，驳回"
}
```

规则:

- `reviewComment` 必填
- 拒绝后不改参与记录，仅记录审核意见

---

## 8. 公共内容接口

## 8.1 读取 public 文件

- Method: `GET`
- Path: `/api/content/public-file`
- 鉴权: 否

Query 参数:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | `public/` 目录下路径 |

示例:

`/api/content/public-file?path=banners/home.png`

---

## 9. 前端对接建议

1. 建立统一请求层，按 `code` 处理业务错误，不要只看 HTTP 状态码。
2. `40101` 时自动触发 refresh，一次重试原请求。
3. 刷码页面要处理幂等 action:
   - `already_checked_in`
   - `already_checked_out`
4. 管理端页面按角色动态显示能力:
   - 超级管理员: 创建项目、改负责人、管理员列表
   - 管理员: 仅自己负责项目的开启/结束/取码
5. 申请列表页区分“待审核/已通过/已拒绝”，并展示审核意见。

---

## 10. 已废弃接口与字段

已废弃:

- `reviewing_count`
- 参与记录审核状态流 `participant.status`
- `/api/admin/projects/reviews`
- `/api/admin/projects/:projectId/reviews/:userId/approve`
- `/api/admin/projects/:projectId/reviews/:userId/reject`
