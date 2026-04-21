import path from "path";

import { fetchObjectFromStorage } from "../services/objectStorageService.js";
import { AppError } from "../utils/errors.js";

function normalizePublicPath(rawPath) {
  const trimmedPath = String(rawPath || "").trim().replace(/^\/+/, "");
  if (!trimmedPath) {
    throw new AppError(40001, "参数错误: path 不能为空", 200);
  }
  if (trimmedPath.includes("\\")) {
    throw new AppError(40001, "参数错误: path 不合法", 200);
  }

  const prefixedPath = trimmedPath.startsWith("public/")
    ? trimmedPath
    : `public/${trimmedPath}`;
  const normalizedPath = path.posix.normalize(prefixedPath);
  if (normalizedPath === "public" || normalizedPath.startsWith("public/")) {
    return normalizedPath;
  }

  throw new AppError(40001, "参数错误: path 不合法", 200);
}

/**
 * 无需鉴权读取对象存储 public 目录文件。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<void>} 直接返回文件二进制内容。
 */
export async function getPublicContentFile(req, res) {
  const objectKey = normalizePublicPath(req.query?.path);
  const objectFile = await fetchObjectFromStorage(objectKey);

  if (objectFile.contentType) {
    res.setHeader("Content-Type", objectFile.contentType);
  }
  if (objectFile.cacheControl) {
    res.setHeader("Cache-Control", objectFile.cacheControl);
  }
  if (objectFile.etag) {
    res.setHeader("ETag", objectFile.etag);
  }

  res.status(200).send(objectFile.body);
}
