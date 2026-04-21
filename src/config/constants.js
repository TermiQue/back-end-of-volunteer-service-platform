// 导入 dotenv
import 'dotenv/config';

function toNumber(value, fallback) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function toList(value, fallback = []) {
	if (!value || typeof value !== 'string') {
		return fallback;
	}

	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

// 导出常量
export const PORT = toNumber(process.env.PORT, 8080);
export const DB_HOST = process.env.DB_HOST || 'localhost';
export const DB_PORT = toNumber(process.env.DB_PORT, 3306);
export const DB_USER = process.env.DB_USER || 'root';
export const DB_PASSWORD = process.env.DB_PASSWORD || '';
export const DB_NAME = process.env.DB_NAME || 'test';
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';
export const JWT_ALGORITHM = process.env.JWT_ALGORITHM || 'HS256';
export const ACCESS_TOKEN_EXPIRES_SECONDS = toNumber(process.env.ACCESS_TOKEN_EXPIRES_SECONDS, 3600);
export const REFRESH_TOKEN_EXPIRES_SECONDS = toNumber(process.env.REFRESH_TOKEN_EXPIRES_SECONDS, 604800);
export const DEBUG = process.env.DEBUG === 'true';
export const WECHAT_APP_ID = process.env.WECHAT_APP_ID || '';
export const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || '';
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const CORS_ALLOWED_ORIGINS = toList(process.env.CORS_ALLOWED_ORIGINS, ['http://127.0.0.1:4173']);
export const CORS_ALLOWED_METHODS = toList(
	process.env.CORS_ALLOWED_METHODS,
	['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
);
export const CORS_ALLOWED_HEADERS = toList(process.env.CORS_ALLOWED_HEADERS, ['Authorization', 'Content-Type']);
export const CORS_EXPOSED_HEADERS = toList(process.env.CORS_EXPOSED_HEADERS, ['x-request-id']);
export const DEFAULT_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
export const DEFAULT_FORMAT = process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'json' : 'pretty');
export const REDACTION_ENABLED = process.env.LOG_REDACT !== 'false';
export const OBJECT_STORAGE_BUCKET = process.env.OBJECT_STORAGE_BUCKET || '';
export const OBJECT_STORAGE_ACCESS_KEY = process.env.OBJECT_STORAGE_ACCESS_KEY || '';
export const OBJECT_STORAGE_SECRET_KEY = process.env.OBJECT_STORAGE_SECRET_KEY || '';
export const OBJECT_STORAGE_INTERNAL_URL = process.env.OBJECT_STORAGE_INTERNAL_URL || '';
export const OBJECT_STORAGE_URL = process.env.OBJECT_STORAGE_URL || '';
export const IS_DEBUG = process.env.IS_DEBUG || 0;