import crypto from 'crypto';
import {
	DEFAULT_LEVEL,
	DEFAULT_FORMAT,
	REDACTION_ENABLED
} from '../config/constants.js';

const LEVELS = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

function getLevelThreshold(level = DEFAULT_LEVEL) {
	return LEVELS[level] ?? LEVELS.info;
}

function shouldLog(level) {
	return (LEVELS[level] ?? LEVELS.info) >= getLevelThreshold();
}

function isoNow() {
	return new Date().toISOString();
}

function cleanValue(value) {
	if (value instanceof Error) {
		return serializeError(value);
	}

	if (Array.isArray(value)) {
		return value.map(cleanValue);
	}

	if (value && typeof value === 'object') {
		const output = {};
		for (const [key, nestedValue] of Object.entries(value)) {
			if (REDACTION_ENABLED && /token|password|secret|code|session_key|openid|unionid/i.test(key)) {
				output[key] = '[REDACTED]';
				continue;
			}
			output[key] = cleanValue(nestedValue);
		}
		return output;
	}

	return value;
}

function serializeError(error) {
	return {
		name: error?.name || 'Error',
		message: error?.message || 'Unknown error',
		stack: error?.stack || null,
		code: error?.code ?? null,
		httpStatus: error?.httpStatus ?? null,
		details: cleanValue(error?.details ?? null),
	};
}

function formatPretty(entry) {
	const meta = entry.meta && Object.keys(entry.meta).length > 0 ? ` ${JSON.stringify(entry.meta)}` : '';
	return `${entry.timestamp} [${entry.level.toUpperCase()}] ${entry.message}${meta}`;
}

function formatJson(entry) {
	return JSON.stringify(entry);
}

function emit(level, message, meta = {}) {
	if (!shouldLog(level)) {
		return;
	}

	const entry = {
		timestamp: isoNow(),
		level,
		message,
		meta: cleanValue(meta),
	};

	const line = DEFAULT_FORMAT === 'json' ? formatJson(entry) : formatPretty(entry);
	if (level === 'error') {
		console.error(line);
		return;
	}
	if (level === 'warn') {
		console.warn(line);
		return;
	}
	console.log(line);
}

export const logger = {
	debug(message, meta = {}) {
		emit('debug', message, meta);
	},
	info(message, meta = {}) {
		emit('info', message, meta);
	},
	warn(message, meta = {}) {
		emit('warn', message, meta);
	},
	error(message, meta = {}) {
		emit('error', message, meta);
	},
	child(defaultMeta = {}) {
		return {
			debug(message, meta = {}) {
				emit('debug', message, { ...defaultMeta, ...meta });
			},
			info(message, meta = {}) {
				emit('info', message, { ...defaultMeta, ...meta });
			},
			warn(message, meta = {}) {
				emit('warn', message, { ...defaultMeta, ...meta });
			},
			error(message, meta = {}) {
				emit('error', message, { ...defaultMeta, ...meta });
			},
		};
	},
	createRequestId() {
		return crypto.randomUUID();
	},
	serializeError,
	cleanValue,
};
