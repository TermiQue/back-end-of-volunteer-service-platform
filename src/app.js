// 导入 dotenv 配置（自动加载 .env 文件中的环境变量）
import 'dotenv/config';

// 导入 Express 框架，导入根路由模块
import cors from 'cors';
import express from 'express';
import rootRouter from './routes/index.js';
import {
	CORS_ALLOWED_HEADERS,
	CORS_ALLOWED_METHODS,
	CORS_ALLOWED_ORIGINS,
	CORS_EXPOSED_HEADERS,
} from './config/constants.js';
import { AppError } from './utils/errors.js';
import { logger } from './utils/logger.js';

// 创建 Express 应用实例，使用 JSON 中间件解析请求体
const app = express();

const corsOptions = {
	origin(origin, callback) {
		if (!origin) {
			return callback(null, true);
		}

		const allowed = CORS_ALLOWED_ORIGINS.includes(origin);
		if (allowed) {
			return callback(null, true);
		}

		return callback(new AppError(40301, '当前来源不允许访问', 403));
	},
	methods: CORS_ALLOWED_METHODS,
	allowedHeaders: CORS_ALLOWED_HEADERS,
	exposedHeaders: CORS_EXPOSED_HEADERS,
	optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(express.json());

app.use((req, res, next) => {
	const requestId = req.headers['x-request-id'] || logger.createRequestId();
	const startedAt = Date.now();

	req.requestId = requestId;
	res.setHeader('x-request-id', requestId);

	logger.info('request started', {
		requestId,
		method: req.method,
		path: req.originalUrl,
		ip: req.ip,
		userAgent: req.headers['user-agent'] || null,
		query: logger.cleanValue(req.query || {}),
		body: logger.cleanValue(req.body || {}),
	});

	res.on('finish', () => {
		const durationMs = Date.now() - startedAt;
		logger.info('request completed', {
			requestId,
			method: req.method,
			path: req.originalUrl,
			statusCode: res.statusCode,
			durationMs,
			query: logger.cleanValue(req.query || {}),
		});
	});

	next();
});

// 挂载路由
app.use(rootRouter);

// 统一错误处理，保证错误响应结构一致
app.use((err, req, res, _next) => {
	const statusCode = err instanceof AppError ? err.httpStatus || 200 : 500;
	const requestId = req?.requestId || null;
	const logMethod = err instanceof AppError ? 'warn' : 'error';

	logger[logMethod]('request failed', {
		requestId,
		method: req?.method || null,
		path: req?.originalUrl || null,
		statusCode,
		error: err,
	});

	if (err instanceof AppError) {
		return res.status(statusCode).json({
			code: err.code,
			message: err.message,
			details: err.details || null,
		});
	}

	return res.status(statusCode).json({
		code: 50000,
		message: err?.message || 'Internal Server Error',
		details: null,
	});
});

// 仅导出应用实例，由入口文件统一启动
export default app;