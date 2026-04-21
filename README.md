# 志愿服务平台后端

基于 Node.js + Express 的志愿服务平台后端，覆盖微信登录、会话认证、志愿项目管理、签到签退、时长申诉与审核流程。

## 技术栈

- Node.js（ESM）
- Express 5
- MySQL（mysql2/promise）
- JWT（accessToken + refreshToken）
- Axios（微信 API 调用）
- AWS S3 SDK（对象存储头像上传）

## 核心能力

- 用户认证
	- 微信登录
	- 会话刷新与登出
	- 个人资料读取与更新（昵称、头像）
- 志愿项目
	- 超级管理员创建草稿项目
	- 管理员/负责人开启和结束项目
	- 超级管理员修改项目负责人（项目结束后禁止修改）
	- 管理员查询项目、志愿者及详情
- 二维码签到
	- 管理员生成签到码/签退码
	- 志愿者扫码签到/签退
- 申诉审核
	- 志愿者提交时长申诉
	- 志愿者查询可申诉目标与我的申诉进度
	- 管理员按状态筛选并审批/拒绝申诉

## 目录结构

```text
.
├── serve.js                # 启动入口
├── src
│   ├── app.js              # 应用装配（中间件、路由、错误处理）
│   ├── config              # 环境与常量配置
│   ├── controllers         # 控制器层
│   ├── services            # 业务编排层
│   ├── dao                 # 数据访问层
│   ├── routes              # 路由定义
│   └── utils               # 通用工具（鉴权、日志、错误、响应、上传）
└── docs                    # 设计与接口文档
```

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 配置环境变量（建议创建 `.env`）

```env
PORT=8080

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=volunteer

JWT_SECRET=replace-with-strong-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRES_SECONDS=3600
REFRESH_TOKEN_EXPIRES_SECONDS=604800

WECHAT_APP_ID=your_app_id
WECHAT_APP_SECRET=your_app_secret

OBJECT_STORAGE_BUCKET=your_bucket
OBJECT_STORAGE_ACCESS_KEY=your_access_key
OBJECT_STORAGE_SECRET_KEY=your_secret_key
OBJECT_STORAGE_INTERNAL_URL=https://internal-endpoint
OBJECT_STORAGE_URL=https://public-endpoint

CORS_ALLOWED_ORIGINS=http://127.0.0.1:4173
```

3. 启动服务

```bash
npm run dev
```

4. 健康检查

```bash
curl -sS http://127.0.0.1:8080/healthz
```

## 运行脚本

- `npm run dev`: 开发启动（当前与 `start` 一致）
- `npm start`: 生产启动

## 主要路由分组

- 认证与用户相关（无需/需要登录）
	- `POST /api/login/wechat`
	- `GET /api/auth/me`
	- `POST /api/auth/refresh-token`
	- `POST /api/auth/logout`
	- `GET/POST /api/auth/nickname`
	- `GET/POST /api/auth/avatar`
	- `POST /api/auth/profile`
	- `POST /api/auth/profile/refresh`
	- `GET /api/auth/projects`
- 内容与申诉（需登录）
	- `GET /api/content/public-file`
	- `POST /api/projects/scan`
	- `GET /api/appeals/targets`
	- `GET /api/appeals/my`
	- `POST /api/appeals`
- 管理端（需管理员权限）
	- `GET /api/admin/projects`
	- `POST /api/admin/projects`
	- `POST /api/admin/projects/:projectId/responsible`
	- `POST /api/admin/projects/:projectId/start`
	- `POST /api/admin/projects/:projectId/end`
	- `GET /api/admin/projects/:projectId/qr/checkin`
	- `GET /api/admin/projects/:projectId/qr/checkout`
	- `GET /api/admin/volunteers`
	- `GET /api/admin/volunteers/:userId`
	- `GET /api/admin/admins`
	- `GET /api/admin/appeals`
	- `POST /api/admin/appeals/:appealId/approve`
	- `POST /api/admin/appeals/:appealId/reject`

完整参数与返回示例请查看 `docs/API.md`。

## 权限模型（简要）

- 普通用户：`role=1`
- 管理员：`role=2`
- 超级管理员：`role=3`

管理端路由统一要求登录且具备管理员权限，部分接口（如创建项目、修改负责人、管理员列表）额外要求超级管理员。

## 日志与排障

- 服务日志输出到标准输出。
- 每个请求都会生成/透传 `x-request-id`，便于排查链路。
- 可通过环境变量控制日志：
	- `LOG_LEVEL=debug|info|warn|error`
	- `LOG_FORMAT=pretty|json`
	- `LOG_REDACT=false`（仅建议本地调试）

## 常见联调提示

- 所有受保护接口需在 `Authorization` 中传 `Bearer <accessToken>`。
- 跨域联调时请正确设置 `CORS_ALLOWED_ORIGINS`。
- 头像上传使用 `multipart/form-data`，字段名为 `avatar`。

## 相关文档

- `docs/API.md`: 接口文档
- `docs/auth-design.md`: 认证与权限设计
- `docs/database.md`: 数据库说明
- `docs/update.md`: 变更记录