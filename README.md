# 志愿服务平台后端

## 项目简介

这是一个基于 Node.js + Express 的后端服务，当前重点实现微信登录与会话认证能力，包含：

- 微信登录（创建用户与会话）
- accessToken 鉴权
- refreshToken 轮换刷新
- 当前会话登出

## 目录说明

- `src/controllers`: 接口控制器
- `src/services`: 业务编排层
- `src/dao`: 数据访问层
- `src/routes`: 路由定义
- `src/utils`: 通用工具（鉴权、响应、错误处理）
- `docs`: 设计文档

## 快速启动

1. 安装依赖

```bash
npm install
```

2. 启动服务

```bash
npm run dev
```

3. 健康检查

```bash
curl -sS http://127.0.0.1:8080/healthz
```

## 日志查看

当前项目把日志输出到标准输出，也就是你启动服务的那个终端窗口。

- 本地开发时直接运行 `npm run dev`，在终端里查看启动日志、请求日志、错误日志。
- 每条请求日志都会带 `requestId`，排查问题时可以按这个 ID 关联启动、请求和错误信息。
- 默认开发环境使用可读格式，生产环境默认输出 JSON，便于后续接入 PM2、Docker、systemd 或日志采集系统。
- 可以通过环境变量控制输出：
	- `LOG_LEVEL=debug|info|warn|error`
	- `LOG_FORMAT=pretty|json`
	- `LOG_REDACT=false`：仅用于本地调试，关闭字段脱敏，方便查看原始值

如果以后用 PM2，可以通过 `pm2 logs` 查看；如果用 Docker，则查看容器标准输出；如果用 systemd，则用 `journalctl` 查看对应服务日志。

## 环境变量

主要环境变量如下：

- `PORT`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`
- `JWT_ALGORITHM`
- `ACCESS_TOKEN_EXPIRES_SECONDS`
- `REFRESH_TOKEN_EXPIRES_SECONDS`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`
- `OBJECT_STORAGE_INTERNAL_URL`
- `OBJECT_STORAGE_URL`
- `CORS_ALLOWED_ORIGINS`（逗号分隔，默认 `http://127.0.0.1:4173`）
- `CORS_ALLOWED_METHODS`（逗号分隔，默认 `GET,POST,PUT,PATCH,DELETE,OPTIONS`）
- `CORS_ALLOWED_HEADERS`（逗号分隔，默认 `Authorization,Content-Type`）
- `CORS_EXPOSED_HEADERS`（逗号分隔，默认 `x-request-id`）

### 头像上传说明

- `POST /api/auth/user` 需要使用 `multipart/form-data`。
- 请求字段包含 `updateType`，可选值：`nickname`、`avatar`、`both`。
- 当 `updateType=nickname` 时只传 `nickname`；当 `updateType=avatar` 时只传 `avatar`；`both` 需两者都传。
- `avatar` 会由后端通过 `OBJECT_STORAGE_INTERNAL_URL` 上传到 Sealos 对象存储。
- 数据库存储和接口返回的头像地址使用 `OBJECT_STORAGE_URL` 作为前缀，保证前端可直接访问。

### 本地浏览器联调（CORS）

如果前端页面和后端不在同源（例如前端 `http://127.0.0.1:4173`，后端 `http://127.0.0.1:8080`），浏览器会触发 CORS 校验。

你可以在启动前显式设置允许来源：

```bash
export CORS_ALLOWED_ORIGINS="http://127.0.0.1:4173"
npm run dev
```

当前默认允许请求头包含 `Authorization`，可直接用 Bearer Token 调试受保护接口。

## 文档

- 接口文档: `API.md`
- 认证设计: `docs/auth-design.md`
- 数据库说明: `docs/database.md`