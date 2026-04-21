import crypto from "crypto";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
	OBJECT_STORAGE_ACCESS_KEY,
	OBJECT_STORAGE_BUCKET,
	OBJECT_STORAGE_INTERNAL_URL,
	OBJECT_STORAGE_SECRET_KEY,
} from "../config/constants.js";
import { AppError } from "../utils/errors.js";

const resolvedEndpoint = OBJECT_STORAGE_INTERNAL_URL
	? (OBJECT_STORAGE_INTERNAL_URL.startsWith("http://") || OBJECT_STORAGE_INTERNAL_URL.startsWith("https://")
		? OBJECT_STORAGE_INTERNAL_URL
		: `http://${OBJECT_STORAGE_INTERNAL_URL}`)
	: "";

const s3Client = resolvedEndpoint
	? new S3Client({
		region: "us-east-1",
		endpoint: resolvedEndpoint,
		forcePathStyle: true,
		credentials: {
			accessKeyId: OBJECT_STORAGE_ACCESS_KEY,
			secretAccessKey: OBJECT_STORAGE_SECRET_KEY,
		},
	})
	: null;

function getAvatarFileExtension(mimetype) {
	switch (mimetype) {
		case "image/jpeg":
			return "jpg";
		case "image/png":
			return "png";
		case "image/webp":
			return "webp";
		case "image/gif":
			return "gif";
		case "image/svg+xml":
			return "svg";
		default:
			return "bin";
	}
}

function assertObjectStorageConfigured() {
	if (!s3Client) {
		throw new AppError(50000, "对象存储配置缺失", 500);
	}

	if (!OBJECT_STORAGE_BUCKET) {
		throw new AppError(50000, "对象存储桶未配置", 500);
	}
}

function normalizeObjectKey(rawKey) {
	return String(rawKey || "").trim().replace(/^\/+/, "");
}

function stripBucketPrefix(objectKey) {
	const normalizedBucket = String(OBJECT_STORAGE_BUCKET || "").trim().replace(/^\/+|\/+$/g, "");
	if (!normalizedBucket) {
		return objectKey;
	}

	const bucketPrefix = `${normalizedBucket}/`;
	if (objectKey.startsWith(bucketPrefix)) {
		return objectKey.slice(bucketPrefix.length);
	}

	return objectKey;
}

async function convertBodyToBuffer(body) {
	if (!body) {
		return Buffer.alloc(0);
	}

	if (Buffer.isBuffer(body)) {
		return body;
	}

	if (typeof body.transformToByteArray === "function") {
		const byteArray = await body.transformToByteArray();
		return Buffer.from(byteArray);
	}

	if (typeof body.pipe === "function") {
		const chunks = [];
		for await (const chunk of body) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
		return Buffer.concat(chunks);
	}

	throw new AppError(50000, "对象存储返回数据格式不支持", 500);
}

export function resolveObjectStorageKey(storedValue) {
	const rawValue = String(storedValue || "").trim();
	if (!rawValue) {
		return "";
	}

	if (rawValue.startsWith("http://") || rawValue.startsWith("https://")) {
		try {
			const parsedUrl = new URL(rawValue);
			const keyFromUrlPath = normalizeObjectKey(parsedUrl.pathname);
			return stripBucketPrefix(keyFromUrlPath);
		} catch (_error) {
			return "";
		}
	}

	return stripBucketPrefix(normalizeObjectKey(rawValue));
}

/**
 * 根据对象存储 key 读取文件内容。
 * @param {string} objectKey 对象存储 key。
 * @returns {Promise<{key:string,body:Buffer,contentType:string,cacheControl:string|null,etag:string|null}>} 文件信息。
 */
export async function fetchObjectFromStorage(objectKey) {
	assertObjectStorageConfigured();

	const normalizedKey = normalizeObjectKey(objectKey);
	if (!normalizedKey) {
		throw new AppError(40001, "参数错误: 对象存储路径不能为空", 200);
	}

	try {
		const objectResult = await s3Client.send(
			new GetObjectCommand({
				Bucket: OBJECT_STORAGE_BUCKET,
				Key: normalizedKey,
			})
		);

		const body = await convertBodyToBuffer(objectResult.Body);
		return {
			key: normalizedKey,
			body,
			contentType: objectResult.ContentType || "application/octet-stream",
			cacheControl: objectResult.CacheControl || null,
			etag: objectResult.ETag || null,
		};
	} catch (error) {
		if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
			throw new AppError(40401, "文件不存在", 200);
		}
		throw error;
	}
}

/**
 * 上传头像文件到对象存储并返回可访问 URL。
 * @param {Express.Multer.File} file 上传文件。
 * @param {number|string} userId 当前用户 ID。
 * @returns {Promise<{key:string,url:string}>} 对象存储 key 与访问 URL。
 */
export async function uploadAvatarToObjectStorage(file, userId) {
	assertObjectStorageConfigured();

	if (!file || !file.buffer || file.buffer.length === 0) {
		throw new AppError(40001, "头像文件不能为空", 200);
	}

	const fileExtension = getAvatarFileExtension(file.mimetype);
	const objectKey = `avatars/${userId}/${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;

	await s3Client.send(
		new PutObjectCommand({
			Bucket: OBJECT_STORAGE_BUCKET,
			Key: objectKey,
			Body: file.buffer,
			ContentType: file.mimetype,
		})
	);

	return {
		key: objectKey,
		url: "/api/auth/avatar",
	};
}
