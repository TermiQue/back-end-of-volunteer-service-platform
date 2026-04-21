import crypto from "crypto";
import jwt from "jsonwebtoken";
import { 
  JWT_SECRET, 
  JWT_ALGORITHM, 
  ACCESS_TOKEN_EXPIRES_SECONDS, 
  REFRESH_TOKEN_EXPIRES_SECONDS 
} from "../config/constants.js";
import { AppError } from "./errors.js";
import { pool } from "../config/db.js";
import { findUserById } from "../dao/userDao.js";
import { findLoginSessionByAccessToken } from "../dao/sessionDao.js";

export function makeTokens(userId) {
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomUUID();

  // 短Token
  const accessPayload = {
    sub: String(userId),
    jti,
    type: "access",
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRES_SECONDS,
  };
  const accessToken = jwt.sign(accessPayload, JWT_SECRET, { algorithm: JWT_ALGORITHM });

  // 长Token
  const refreshPayload = {
    sub: String(userId),
    jti,
    type: "refresh",
    iat: now,
    exp: now + REFRESH_TOKEN_EXPIRES_SECONDS,
  };
  const refreshToken = jwt.sign(refreshPayload, JWT_SECRET, { algorithm: JWT_ALGORITHM });

  return { accessToken, refreshToken, accessPayload, refreshPayload };
}

function verifyJwt(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    return { payload, err: null };
  } catch (_err) {
    return { payload: null, err: "invalid" };
  }
}

function parseBearerToken(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice(7).trim();
  return token || null;
}

export function verifyAccessToken(token) {
  const { payload, err } = verifyJwt(token);
  if (err || payload?.type !== "access") {
    throw new AppError(40101, "访问令牌无效", 200);
  }
  return payload;
}

export function verifyRefreshToken(token) {
  const { payload, err } = verifyJwt(token);
  if (err || payload?.type !== "refresh") {
    throw new AppError(40101, "刷新令牌无效", 200);
  }
  return payload;
}

/**
 * 鉴权中间件：校验 access token 并从数据库加载当前会话与用户。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} _res 响应对象（未使用）。
 * @param {import("express").NextFunction} next 中间件回调。
 * @returns {Promise<void>} 通过 next 继续链路，无显式返回值。
 */
export async function requireAuth(req, _res, next) {
  const token = parseBearerToken(req);
  if (!token) {
    return next(new AppError(40101, "缺少访问令牌", 200));
  }

  let conn;
  try {
    const payload = verifyAccessToken(token);

    conn = await pool.getConnection();
    const session = await findLoginSessionByAccessToken(conn, token);
    if (!session || session.login_status !== 1) {
      throw new AppError(40101, "登录状态无效，请重新登录", 200);
    }

    if (new Date(session.access_expire_at) < new Date()) {
      throw new AppError(40101, "访问令牌已过期", 200);
    }

    if (String(session.user_id) !== String(payload.sub)) {
      throw new AppError(40101, "访问令牌与会话不匹配", 200);
    }

    const user = await findUserById(conn, session.user_id);
    if (!user) {
      throw new AppError(40401, "用户不存在", 200);
    }
    if (user.status !== 1) {
      throw new AppError(40301, "账号被禁用", 200);
    }

    req.currentUser = user;
    req.currentSession = session;
    req.currentToken = token;
    return next();
  } catch (err) {
    return next(err);
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

/**
 * 管理员鉴权中间件：依赖 requireAuth 先注入 req.currentUser。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} _res 响应对象（未使用）。
 * @param {import("express").NextFunction} next 中间件回调。
 * @returns {void} 通过 next 继续链路。
 */
export function requireAdmin(req, _res, next) {
  if (!req.currentUser) {
    return next(new AppError(40101, "未登录", 200));
  }
  if (![2, 3].includes(req.currentUser.role)) {
    return next(new AppError(40301, "权限不足，仅管理员可操作", 200));
  }
  return next();
}

/**
 * 超级管理员鉴权中间件：依赖 requireAuth 先注入 req.currentUser。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} _res 响应对象（未使用）。
 * @param {import("express").NextFunction} next 中间件回调。
 * @returns {void} 通过 next 继续链路。
 */
export function requireSuperAdmin(req, _res, next) {
  if (!req.currentUser) {
    return next(new AppError(40101, "未登录", 200));
  }
  if (req.currentUser.role !== 3) {
    return next(new AppError(40301, "权限不足，仅超级管理员可操作", 200));
  }
  return next();
}