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

说明:

- `data` 可能是对象、数组或 `null`（例如登出接口）。
- 文件下载类接口直接返回二进制流，不走上述 JSON 结构。

字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| code | number | 业务状态码，`0` 表示成功 |
| message | string | 业务提示信息，用于前端提示或日志 |
| data | object/array/null | 业务数据主体，具体结构见各接口 |

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

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| accessToken | string | 访问令牌，用于访问受保护接口 |
| refreshToken | string | 刷新令牌，用于换取新的 accessToken |
| user.userId | number | 用户 ID |
| user.nickname | string | 用户昵称 |
| user.avatarUrl | string | 头像访问地址；为空字符串表示未设置头像 |
| user.role | number | 角色值，见“用户角色”枚举 |

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

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| user.userId | number | 用户 ID |
| user.nickname | string | 用户昵称 |
| user.avatarUrl | string | 头像访问地址；为空字符串表示未设置 |
| user.role | number | 角色值，见“用户角色”枚举 |
| user.profile | object/null | 角色扩展资料；未创建志愿者资料时可能为 `null` |
| user.profile.user_id | number | 志愿者资料关联用户 ID |
| user.profile.name | string | 姓名 |
| user.profile.student_id | string | 学号 |
| user.profile.phone | string/null | 手机号 |
| user.profile.volunteer_hours | string/number | 累计志愿时长（小时） |
| user.profile.project_count | number | 已计入统计的项目数量 |

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

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| accessToken | string | 新的访问令牌 |
| refreshToken | string | 新的刷新令牌（旧的失效） |

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

`data` 说明:

- 固定返回 `null`，表示仅执行会话失效操作，无业务数据。

---

## 5. 个人资料接口

## 5.1 获取昵称

- Method: `GET`
- Path: `/api/auth/nickname`
- 鉴权: 是

成功响应示例:

```json
{
  "code": 0,
  "message": "获取成功",
  "data": {
    "nickname": "张三"
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| nickname | string | 当前用户昵称 |

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

成功响应示例:

```json
{
  "code": 0,
  "message": "更新成功",
  "data": {
    "user": {
      "userId": 101,
      "nickname": "新的昵称",
      "avatarUrl": "/api/auth/avatar",
      "role": 0
    }
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| user.userId | number | 用户 ID |
| user.nickname | string | 更新后的昵称 |
| user.avatarUrl | string | 头像访问地址 |
| user.role | number | 用户角色 |

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

成功响应示例:

```json
{
  "code": 0,
  "message": "更新成功",
  "data": {
    "user": {
      "userId": 101,
      "nickname": "张三",
      "avatarUrl": "/api/auth/avatar",
      "role": 0
    }
  }
}
```

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

成功响应示例:

```json
{
  "code": 0,
  "message": "更新成功",
  "data": {
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
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| profile.user_id | number | 用户 ID |
| profile.name | string | 姓名 |
| profile.student_id | string | 学号 |
| profile.phone | string/null | 手机号 |
| profile.volunteer_hours | string/number | 累计志愿时长 |
| profile.project_count | number | 统计项目数 |

---

## 5.6 刷新志愿者汇总

- Method: `POST`
- Path: `/api/auth/profile/refresh`
- 鉴权: 是

说明:

- 基于参与记录重算 `volunteer_hours` 与 `project_count`。

成功响应示例:

```json
{
  "code": 0,
  "message": "刷新成功",
  "data": {
    "profile": {
      "user_id": 101,
      "name": "张三",
      "student_id": "20230001",
      "phone": "13800000000",
      "volunteer_hours": "13.0",
      "project_count": 5
    }
  }
}
```

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

- `items[]` 字段：
  - `project`：项目信息
    - `projectName`：项目名
    - `projectDescription`：项目描述
    - `creatorName`：创建者姓名
    - `creatorId`：创建者 ID
    - `responsibleName`：负责人姓名
    - `responsibleId`：负责人 ID
    - `projectDesignStartTime`：项目设计开始时间
    - `projectDesignEndTime`：项目设计结束时间
  - `participant`：参与记录信息
    - `actualCheckInTime`：实际签到时间
    - `actualCheckOutTime`：实际签退时间
    - `projectIsValid`：项目是否有效（参与记录 `is_valid`）
    - `settlementHours`：结算时间（小时）
    - `note`：备注

成功响应示例:

```json
{
  "code": 0,
  "message": "查询成功",
  "data": {
    "items": [
      {
        "project": {
          "projectName": "社区义诊",
          "projectDescription": "周末志愿服务",
          "creatorName": "管理员A",
          "creatorId": 2001,
          "responsibleName": "管理员B",
          "responsibleId": 2002,
          "projectDesignStartTime": "2026-05-01T09:00:00.000Z",
          "projectDesignEndTime": "2026-05-01T12:00:00.000Z"
        },
        "participant": {
          "actualCheckInTime": "2026-05-01T09:03:00.000Z",
          "actualCheckOutTime": "2026-05-01T11:31:00.000Z",
          "projectIsValid": 1,
          "settlementHours": "2.5",
          "note": "auto-settlement"
        }
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| items | array | 当前页项目参与记录列表 |
| items[].project | object | 项目信息 |
| items[].participant | object | 当前用户在该项目的参与记录 |
| items[].participant.projectIsValid | number | 参与记录有效性：1 有效，0 无效 |
| items[].participant.settlementHours | string/number/null | 结算时长（小时） |
| total | number | 符合条件的总记录数 |
| page | number | 当前页码 |
| pageSize | number | 每页条数 |

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

成功响应示例:

```json
{
  "code": 0,
  "message": "扫码签到成功",
  "data": {
    "action": "checked_in",
    "projectId": 3001,
    "participant": {
      "id": 9001,
      "project_id": 3001,
      "user_id": 101,
      "check_in_at": "2026-05-01T09:03:00.000Z",
      "check_out_at": null,
      "is_valid": 1,
      "settlement_hours": null,
      "note": null
    }
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| action | string | 扫码动作结果，见上方枚举 |
| projectId | number | 项目 ID |
| participant | object | 参与记录原始对象（数据库字段命名） |
| participant.id | number | 参与记录 ID |
| participant.project_id | number | 项目 ID |
| participant.user_id | number | 用户 ID |
| participant.check_in_at | string/null | 实际签到时间 |
| participant.check_out_at | string/null | 实际签退时间 |
| participant.is_valid | number | 参与记录是否有效 |
| participant.settlement_hours | string/number/null | 结算时长 |
| participant.note | string/null | 备注 |

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
- 若同一参与记录已有待审核申请，或同一项目已有审核中申请，会返回 `code=40001`。

成功响应示例:

```json
{
  "code": 0,
  "message": "申请提交成功",
  "data": {
    "appeal": {
      "id": 7001,
      "type": 2,
      "participant_id": 9001,
      "applicant_id": 101,
      "expected_reviewer_id": 2002,
      "time": "2.5",
      "reason": "当日提前到场，申请修正时长",
      "apply_time": "2026-05-01T13:00:00.000Z",
      "status": 0,
      "reviewer_id": null,
      "review_time": null,
      "review_comment": null
    }
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| appeal | object | 新创建的申请记录（数据库字段命名） |
| appeal.id | number | 申请 ID |
| appeal.type | number | 申请类型：1 无效记录申诉，2 时长变更 |
| appeal.participant_id | number | 参与记录 ID |
| appeal.applicant_id | number | 申请人用户 ID |
| appeal.expected_reviewer_id | number | 期望审核员（系统自动指定） |
| appeal.time | string/number | 申请目标时长 |
| appeal.status | number | 状态：0 审核中，1 通过，2 拒绝 |

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

- 仅返回“当前可申请”的条目。
- 已自动排除以下不可申请项：
  - 同一参与记录已有待审核申请。
  - 同一项目下申请人已有审核中申请。
- `items[].type`: 申请类型（`1/2`）
- `items[].participantId`: 参与记录 ID
- `items[].project`: 项目信息
  - `projectName`: 项目名
  - `projectDescription`: 项目描述
  - `creatorName`: 创建者姓名
  - `creatorId`: 创建者 ID
  - `responsibleName`: 负责人姓名
  - `responsibleId`: 负责人 ID
  - `projectDesignStartTime`: 项目设计开始时间
  - `projectDesignEndTime`: 项目设计结束时间
- `items[].participant`: 参与记录信息
  - `actualCheckInTime`: 实际签到时间（无则返回 `0`）
  - `actualCheckOutTime`: 实际签退时间（无则返回 `0`）
  - `isValid`: 是否可用（参与记录 `is_valid`）
  - `settlementHours`: 结算时间（小时）
  - `note`: 备注

业务规则:

- `is_valid=0` 的记录发起“申诉”。
- `is_valid=1` 且已有 `settlement_hours` 的记录发起“时长变更”。
- 同一参与记录仅允许一个待审核申请。
- 同一项目下若已有“审核中”申请，不允许再发起新的申请。

成功响应示例:

```json
{
  "code": 0,
  "message": "查询成功",
  "data": {
    "items": [
      {
        "type": 2,
        "participantId": 9001,
        "project": {
          "projectId": 3001,
          "projectName": "社区义诊",
          "projectDescription": "周末志愿服务",
          "creatorName": "管理员A",
          "creatorId": 2001,
          "responsibleName": "管理员B",
          "responsibleId": 2002,
          "projectDesignStartTime": "2026-05-01T09:00:00.000Z",
          "projectDesignEndTime": "2026-05-01T12:00:00.000Z"
        },
        "participant": {
          "actualCheckInTime": "2026-05-01T09:03:00.000Z",
          "actualCheckOutTime": "2026-05-01T11:31:00.000Z",
          "isValid": 1,
          "settlementHours": "2.5",
          "note": "auto-settlement"
        }
      }
    ]
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| items | array | 可申请目标列表 |
| items[].type | number | 申请类型：1 申诉，2 时长变更 |
| items[].participantId | number | 参与记录 ID |
| items[].project | object | 项目信息 |
| items[].participant | object | 参与记录摘要信息 |

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
- `items[].type`: 申请类型
- `items[].participantId`: 参与记录 ID
- `items[].projectName`: 项目名
- `items[].expectedReviewerName`: 期望审核员姓名
- `items[].actualReviewerName`: 实际审核员姓名
- `items[].status`: 状态（`0` 审核中，`1` 通过，`2` 拒绝）
- `items[].applyTime`: 申请时间
- `items[].reason`: 申请理由
- `items[].reviewTime`: 审核时间
- `items[].reviewComment`: 审核意见

说明:

- 当 `status=0`（审核中）时，`actualReviewerName`、`reviewTime`、`reviewComment` 通常为 `null`。

成功响应示例:

```json
{
  "code": 0,
  "message": "查询成功",
  "data": {
    "items": [
      {
        "type": 2,
        "participantId": 9001,
        "projectName": "社区义诊",
        "expectedReviewerName": "管理员B",
        "actualReviewerName": null,
        "status": 0,
        "applyTime": "2026-05-01T13:00:00.000Z",
        "reason": "当日提前到场，申请修正时长",
        "reviewTime": null,
        "reviewComment": null
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| items | array | 我的申请列表 |
| items[].status | number | 审核状态：0 审核中，1 通过，2 拒绝 |
| items[].applyTime | string | 申请提交时间 |
| items[].reviewTime | string/null | 审核时间 |
| total | number | 总记录数 |
| page | number | 当前页码 |
| pageSize | number | 每页条数 |

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
| page/pageSize | number | 分页 |

成功响应示例:

```json
{
  "code": 0,
  "message": "查询成功",
  "data": {
    "items": [
      {
        "projectId": 3001,
        "projectName": "社区义诊",
        "description": "周末志愿服务",
        "designStartTime": "2026-05-01T01:00:00.000Z",
        "designEndTime": "2026-05-01T04:00:00.000Z",
        "designVolunteerHours": "3.0",
        "status": 1,
        "creatorId": 2001,
        "creatorName": "管理员A",
        "responsibleId": 2002,
        "responsibleName": "管理员B"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| items | array | 项目列表 |
| items[].projectId | number | 项目 ID |
| items[].projectName | string | 项目名 |
| items[].description | string | 项目描述 |
| items[].designStartTime | string | 设计开始时间（ISO 8601） |
| items[].designEndTime | string | 设计结束时间（ISO 8601） |
| items[].designVolunteerHours | string/number | 设计志愿时长（小时） |
| items[].status | number | 项目状态，见“项目状态”枚举 |
| items[].creatorId | number | 创建者用户 ID |
| items[].creatorName | string/null | 创建者姓名 |
| items[].responsibleId | number | 负责人用户 ID |
| items[].responsibleName | string/null | 负责人姓名 |
| total | number | 总记录数 |
| page | number | 当前页码 |
| pageSize | number | 每页条数 |

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

成功响应示例:

```json
{
  "code": 0,
  "message": "创建草稿成功",
  "data": {
    "project": {
      "project_id": 3001,
      "name": "社区义诊",
      "description": "周末志愿服务",
      "start_time": "2026-05-01T01:00:00.000Z",
      "end_time": "2026-05-01T04:00:00.000Z",
      "duration_hours": "3.0",
      "status": 0,
      "created_by_id": 1,
      "responsible_id": 2001,
      "created_at": "2026-04-23T08:00:00.000Z",
      "updated_at": "2026-04-23T08:00:00.000Z"
    }
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| project | object | 新创建的项目（数据库字段命名） |
| project.project_id | number | 项目 ID |
| project.name | string | 项目名 |
| project.description | string | 项目描述 |
| project.start_time | string | 开始时间（ISO 8601） |
| project.end_time | string | 结束时间（ISO 8601） |
| project.duration_hours | string/number | 设计志愿时长 |
| project.status | number | 项目状态：0 未开启，1 进行中，2 已结束 |
| project.created_by_id | number | 创建者用户 ID |
| project.responsible_id | number | 负责人用户 ID |
| project.created_at | string | 创建时间 |
| project.updated_at | string | 更新时间 |

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

成功响应示例:

```json
{
  "code": 0,
  "message": "负责人更新成功",
  "data": {
    "project": {
      "project_id": 3001,
      "name": "社区义诊",
      "description": "周末志愿服务",
      "start_time": "2026-05-01T01:00:00.000Z",
      "end_time": "2026-05-01T04:00:00.000Z",
      "duration_hours": "3.0",
      "status": 0,
      "created_by_id": 1,
      "responsible_id": 2002,
      "created_at": "2026-04-23T08:00:00.000Z",
      "updated_at": "2026-04-23T08:10:00.000Z"
    }
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| project | object | 更新后的项目信息（数据库字段命名） |
| project.responsible_id | number | 新负责人用户 ID |
| project.updated_at | string | 最近更新时间 |

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

成功响应示例:

```json
{
  "code": 0,
  "message": "项目开启成功",
  "data": {
    "project": {
      "project_id": 3001,
      "status": 1,
      "start_time": "2026-05-01T01:00:00.000Z",
      "end_time": "2026-05-01T04:00:00.000Z",
      "updated_at": "2026-05-01T01:00:02.000Z"
    }
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| project | object | 状态变更后的项目对象（数据库字段命名） |
| project.project_id | number | 项目 ID |
| project.status | number | 变更后状态，固定为 `1` |
| project.start_time | string | 项目开始时间 |
| project.end_time | string | 项目结束时间 |
| project.updated_at | string | 最近更新时间 |

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

成功响应示例:

```json
{
  "code": 0,
  "message": "项目结束成功",
  "data": {
    "project": {
      "project_id": 3001,
      "status": 2,
      "start_time": "2026-05-01T01:00:00.000Z",
      "end_time": "2026-05-01T04:00:00.000Z",
      "updated_at": "2026-05-01T04:00:01.000Z"
    }
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| project | object | 状态变更后的项目对象（数据库字段命名） |
| project.project_id | number | 项目 ID |
| project.status | number | 变更后状态，固定为 `2` |
| project.start_time | string | 项目开始时间 |
| project.end_time | string | 项目结束时间 |
| project.updated_at | string | 最近更新时间 |

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

成功响应示例（签到码，签退码仅 `codeType=2` 区别）:

```json
{
  "code": 0,
  "message": "获取签到码成功",
  "data": {
    "qr": {
      "projectId": 3001,
      "codeType": 1,
      "token": "f9f87e4dd4f342f3a9d4a1af66db...",
      "createdAt": "2026-05-01T02:00:00.000Z"
    }
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| qr | object | 二维码 token 信息 |
| qr.projectId | number | 项目 ID |
| qr.codeType | number | 二维码类型：`1` 签到，`2` 签退 |
| qr.token | string | 扫码凭证（一次性消费） |
| qr.createdAt | string | token 创建时间 |

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

成功响应示例:

```json
{
  "code": 0,
  "message": "查询成功",
  "data": {
    "items": [
      {
        "user_id": 101,
        "name": "张三",
        "student_id": "20230001",
        "phone": "13800000000",
        "volunteer_hours": "12.5",
        "project_count": 4,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-04-23T08:00:00.000Z",
        "nickname": "张三",
        "avatar_url": "/api/auth/avatar",
        "role": 0
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| items | array | 志愿者列表（数据库字段命名） |
| items[].user_id | number | 用户 ID |
| items[].name | string | 姓名 |
| items[].student_id | string | 学号 |
| items[].phone | string/null | 手机号 |
| items[].volunteer_hours | string/number | 累计志愿时长 |
| items[].project_count | number | 志愿项目数量 |
| items[].nickname | string | 用户昵称 |
| items[].avatar_url | string | 头像地址 |
| items[].role | number | 用户角色 |
| total | number | 总记录数 |
| page | number | 当前页码 |
| pageSize | number | 每页条数 |

---

## 7.9 查询单个志愿者详情

- Method: `GET`
- Path: `/api/admin/volunteers/:userId`
- 权限: 管理员/超级管理员

返回:

- `volunteer`: 志愿者基础信息
- `projects`: 全部参与记录（不分页）

成功响应示例:

```json
{
  "code": 0,
  "message": "查询成功",
  "data": {
    "volunteer": {
      "user_id": 101,
      "name": "张三",
      "student_id": "20230001",
      "phone": "13800000000",
      "volunteer_hours": "12.5",
      "project_count": 4,
      "nickname": "张三",
      "avatar_url": "/api/auth/avatar",
      "role": 0
    },
    "projects": [
      {
        "id": 9001,
        "project_id": 3001,
        "check_in_at": "2026-05-01T01:03:00.000Z",
        "check_out_at": "2026-05-01T03:31:00.000Z",
        "is_valid": 1,
        "settlement_hours": "2.5",
        "note": "auto-settlement",
        "project_name": "社区义诊",
        "project_status": 2
      }
    ]
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| volunteer | object | 志愿者基础信息（数据库字段命名） |
| volunteer.user_id | number | 用户 ID |
| volunteer.name | string | 姓名 |
| volunteer.student_id | string | 学号 |
| volunteer.phone | string/null | 手机号 |
| volunteer.volunteer_hours | string/number | 累计志愿时长 |
| volunteer.project_count | number | 志愿项目数 |
| volunteer.nickname | string | 用户昵称 |
| volunteer.avatar_url | string | 头像地址 |
| volunteer.role | number | 用户角色 |
| projects | array | 全部参与记录 |
| projects[].id | number | 参与记录 ID |
| projects[].project_id | number | 项目 ID |
| projects[].check_in_at | string/null | 签到时间 |
| projects[].check_out_at | string/null | 签退时间 |
| projects[].is_valid | number | 是否有效：1 有效，0 无效 |
| projects[].settlement_hours | string/number/null | 结算时长 |
| projects[].note | string/null | 备注 |
| projects[].project_name | string | 项目名称 |
| projects[].project_status | number | 项目状态 |

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

成功响应示例:

```json
{
  "code": 0,
  "message": "查询成功",
  "data": {
    "items": [
      {
        "user_id": 1,
        "name": "系统管理员",
        "student_id": null,
        "role": 3,
        "status": 1
      },
      {
        "user_id": 2001,
        "name": "管理员A",
        "student_id": "A0001",
        "role": 2,
        "status": 1
      }
    ]
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| items | array | 管理员列表（含超级管理员） |
| items[].user_id | number | 用户 ID |
| items[].name | string/null | 姓名 |
| items[].student_id | string/null | 学号 |
| items[].role | number | 角色：2 管理员，3 超级管理员 |
| items[].status | number | 账号状态 |

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

成功响应示例:

```json
{
  "code": 0,
  "message": "提升成功",
  "data": {
    "user": {
      "user_id": 101,
      "nickname": "张三",
      "avatar_url": "/api/auth/avatar",
      "role": 2,
      "status": 1
    }
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| user | object | 调整角色后的用户信息 |
| user.user_id | number | 用户 ID |
| user.nickname | string | 用户昵称 |
| user.avatar_url | string | 头像地址 |
| user.role | number | 新角色，固定为 `2` |
| user.status | number | 账号状态 |

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

成功响应示例:

```json
{
  "code": 0,
  "message": "降级成功",
  "data": {
    "user": {
      "user_id": 2001,
      "nickname": "管理员A",
      "avatar_url": "/api/auth/avatar",
      "role": 0,
      "status": 1
    }
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| user | object | 调整角色后的用户信息 |
| user.user_id | number | 用户 ID |
| user.nickname | string | 用户昵称 |
| user.avatar_url | string | 头像地址 |
| user.role | number | 新角色，固定为 `0` |
| user.status | number | 账号状态 |

---

## 7.13 导出项目参与信息 Excel

- Method: `GET`
- Path: `/api/admin/projects/:projectId/participants/export`
- 权限: 管理员/超级管理员

权限差异:

- 超级管理员: 可导出任意项目。
- 管理员: 仅可导出自己负责的项目。

状态限制:

- 仅已结束项目（`status=2`）允许导出。

响应:

- 返回 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` 文件流。
- 文件名规则: `项目名_项目id_时间戳.xlsx`。

返回头说明:

| Header | 示例 | 含义 |
| --- | --- | --- |
| Content-Type | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | 响应体为 Excel 二进制流 |
| Content-Disposition | attachment; filename="...xlsx" | 以附件形式下载，并携带文件名 |

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

成功响应示例:

```json
{
  "code": 0,
  "message": "查询成功",
  "data": {
    "items": [
      {
        "id": 7001,
        "type": 2,
        "participant_id": 9001,
        "applicant_id": 101,
        "expected_reviewer_id": 2002,
        "time": "2.5",
        "reason": "当日提前到场，申请修正时长",
        "apply_time": "2026-05-01T13:00:00.000Z",
        "status": 0,
        "reviewer_id": null,
        "review_time": null,
        "review_comment": null,
        "project_id": 3001,
        "project_name": "社区义诊",
        "expected_reviewer_name": "管理员B",
        "actual_reviewer_name": null
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| items | array | 申请列表（数据库字段命名） |
| items[].id | number | 申请 ID |
| items[].type | number | 申请类型：1 无效记录申诉，2 时长变更 |
| items[].participant_id | number | 参与记录 ID |
| items[].applicant_id | number | 申请人用户 ID |
| items[].expected_reviewer_id | number | 期望审核员用户 ID |
| items[].time | string/number | 申请时长 |
| items[].reason | string | 申请理由 |
| items[].apply_time | string | 申请时间 |
| items[].status | number | 审核状态：0 待审核，1 通过，2 拒绝 |
| items[].reviewer_id | number/null | 实际审核人用户 ID |
| items[].review_time | string/null | 审核时间 |
| items[].review_comment | string/null | 审核意见 |
| items[].project_id | number | 所属项目 ID |
| items[].project_name | string | 项目名 |
| items[].expected_reviewer_name | string/null | 期望审核员姓名 |
| items[].actual_reviewer_name | string/null | 实际审核员姓名 |
| total | number | 总记录数 |
| page | number | 当前页码 |
| pageSize | number | 每页条数 |

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

成功响应示例:

```json
{
  "code": 0,
  "message": "审核通过",
  "data": {
    "appeal": {
      "id": 7001,
      "status": 1,
      "reviewer_id": 2002,
      "review_time": "2026-05-01T14:00:00.000Z",
      "review_comment": "核实通过"
    },
    "participant": {
      "id": 9001,
      "is_valid": 1,
      "settlement_hours": "2.5",
      "note": "申请通过: 核实通过"
    }
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| appeal | object | 审核后的申请记录 |
| appeal.id | number | 申请 ID |
| appeal.status | number | 审核状态，固定为 `1` |
| appeal.reviewer_id | number | 审核人用户 ID |
| appeal.review_time | string | 审核时间 |
| appeal.review_comment | string | 审核意见 |
| participant | object | 审核后参与记录 |
| participant.id | number | 参与记录 ID |
| participant.is_valid | number | 是否有效，固定为 `1` |
| participant.settlement_hours | string/number | 审核通过后的结算时长 |
| participant.note | string | 备注 |

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

成功响应示例:

```json
{
  "code": 0,
  "message": "审核拒绝",
  "data": {
    "appeal": {
      "id": 7001,
      "status": 2,
      "reviewer_id": 2002,
      "review_time": "2026-05-01T14:00:00.000Z",
      "review_comment": "证据不足，驳回"
    }
  }
}
```

`data` 字段说明:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| appeal | object | 审核后的申请记录 |
| appeal.id | number | 申请 ID |
| appeal.status | number | 审核状态，固定为 `2` |
| appeal.reviewer_id | number | 审核人用户 ID |
| appeal.review_time | string | 审核时间 |
| appeal.review_comment | string | 审核意见 |

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

响应说明:

- 成功时直接返回文件二进制流，不走 JSON `code/message/data` 结构。
- `Content-Type` 由对象存储元数据透传（例如 `image/png`、`application/pdf`）。
- 若对象配置缓存信息，会透传 `Cache-Control` 与 `ETag` 响应头。

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

## 10. 联调回归记录

回归时间:

- 2026-04-22

回归环境:

- Base URL: `/api`（本地实际请求使用 `http://127.0.0.1:8080`）
- 服务健康检查: `GET /healthz` 可达（HTTP 200）

本次回归覆盖结果:

| 接口 | 请求 | HTTP | code | message | 结论 |
| --- | --- | --- | --- | --- | --- |
| `/healthz` | `GET /healthz` | 200 | - | - | 健康检查通过 |
| `/api/content/public-file` | 缺少 `path` 参数 | 200 | 40001 | 参数错误: path 不能为空 | 参数校验符合预期 |
| `/api/auth/refresh-token` | `POST {}`（缺少 `refreshToken`） | 200 | 40001 | 参数错误: refreshToken 不能为空 | 参数校验符合预期 |
| `/api/appeals/targets` | 无 `Authorization` | 200 | 40101 | 缺少访问令牌 | 鉴权拦截符合预期 |
| `/api/appeals/my` | 无 `Authorization` | 200 | 40101 | 缺少访问令牌 | 鉴权拦截符合预期 |
| `/api/admin/projects` | 无 `Authorization` | 200 | 40101 | 缺少访问令牌 | 管理接口鉴权符合预期 |
| `/api/admin/appeals` | 无 `Authorization` | 200 | 40101 | 缺少访问令牌 | 管理接口鉴权符合预期 |
| `/api/login/wechat` | `POST {"code":""}` | 200 | 40001 | 参数错误: code 不能为空 | 参数校验符合预期 |
| `/api/login/wechat` | `POST {"code":"fake-code"}` | 500 | 50000 | invalid code（微信侧返回） | 外部依赖异常形态已验证 |

说明:

- 本项目多数业务错误按约定返回 HTTP 200 + 业务 `code`。
- 微信登录在调用外部微信服务失败时，可能走 HTTP 500 + `code=50000`（如 `invalid code`）。

建议补充回归（需有效登录态）:

- 使用真实 `accessToken` 覆盖以下核心路径：
  - `GET /api/auth/projects`（6.1 聚合返回字段）
  - `GET /api/appeals/targets`（6.4 仅可申请条目过滤）
  - `GET /api/appeals/my`（6.5 10 字段返回）
  - `GET /api/admin/projects`（7.1 返回 11 字段）
  - `GET /api/admin/appeals`（7.14 管理员/超管可见范围）

可复用命令模板:

```bash
# 1) 无鉴权回归样例
curl -sS -X GET 'http://127.0.0.1:8080/api/appeals/my'

# 2) 鉴权回归样例
curl -sS -X GET 'http://127.0.0.1:8080/api/auth/projects?page=1&pageSize=20' \
  -H 'Authorization: Bearer <accessToken>'

# 3) 管理端回归样例
curl -sS -X GET 'http://127.0.0.1:8080/api/admin/projects?page=1&pageSize=20' \
  -H 'Authorization: Bearer <adminAccessToken>'
```

---

## 11. 已废弃接口与字段

已废弃:

- `reviewing_count`
- 参与记录审核状态流 `participant.status`
- `/api/admin/projects/reviews`
- `/api/admin/projects/:projectId/reviews/:userId/approve`
- `/api/admin/projects/:projectId/reviews/:userId/reject`
