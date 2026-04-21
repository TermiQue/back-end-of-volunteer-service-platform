import multer from "multer";

import { AppError } from "./errors.js";

const MAX_AVATAR_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/svg+xml",
]);

const memoryStorage = multer.memoryStorage();

function avatarFileFilter(_req, file, callback) {
	if (!ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype)) {
		callback(new AppError(40001, "头像文件格式不支持", 200));
		return;
	}

	callback(null, true);
}

export const avatarUpload = multer({
	storage: memoryStorage,
	fileFilter: avatarFileFilter,
	limits: {
		files: 1,
		fileSize: MAX_AVATAR_FILE_SIZE,
	},
});
