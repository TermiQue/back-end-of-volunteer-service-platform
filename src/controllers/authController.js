import { pool } from "../config/db.js";
import { makeTokens, verifyRefreshToken } from "../utils/auth.js";
import { ok } from "../utils/response.js";
import { AppError, isMysqlDuplicateKeyError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import {
  fetchObjectFromStorage,
  resolveObjectStorageKey,
  uploadAvatarToObjectStorage,
} from "../services/objectStorageService.js";
import { 
  findOrCreateUserByWechat, 
  updateOrCreateLoginSession, 
  getValidSessionByRefreshToken,
  updateTokensBySessionId,
  getVolunteerProfileByUserId,
  createOrUpdateVolunteerProfile,
  refreshVolunteerProfileSummary,
  queryMyVolunteerProjects,
  updateUserBaseInfo
} from "../services/userService.js";
import { revokeSessionById } from "../dao/sessionDao.js";

const SESSION_TOKEN_RETRY_LIMIT = 3;

function isSessionTokenDuplicateError(error) {
  if (!isMysqlDuplicateKeyError(error)) {
    return false;
  }
  const message = String(error?.message || "");
  return message.includes("uk_access_token") || message.includes("uk_refresh_token");
}

async function persistSessionTokensWithRetry(userId, persistTokens) {
  let lastError = null;

  for (let attempt = 0; attempt < SESSION_TOKEN_RETRY_LIMIT; attempt += 1) {
    const tokenResult = makeTokens(userId);
    try {
      await persistTokens(tokenResult);
      return tokenResult;
    } catch (error) {
      if (!isSessionTokenDuplicateError(error)) {
        throw error;
      }
      lastError = error;
    }
  }

  throw new AppError(50000, "令牌生成冲突，请重试", 200, {
    reason: "token_conflict",
    attempts: SESSION_TOKEN_RETRY_LIMIT,
    detail: String(lastError?.message || ""),
  });
}

function buildCurrentUserAvatarUrl(user) {
  return user?.avatar_url ? "/api/auth/avatar" : "";
}

function toUserPayload(user) {
  return {
    userId: user.user_id,
    nickname: user.nickname,
    avatarUrl: buildCurrentUserAvatarUrl(user),
    role: user.role,
  };
}

/**
 * 微信登录：创建或更新用户会话并返回访问令牌。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<void>} 直接写入响应，无显式返回值。
 */
export async function loginWechat(req, res) {
  const body = req.body || {};
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const rawDeviceId = typeof body.deviceId === "string"
    ? body.deviceId
    : typeof body.device_id === "string"
      ? body.device_id
      : "";
  const deviceId = rawDeviceId.trim() || null;
  const deviceTypeValue = Number(body.deviceType ?? body.device_type);
  const deviceType = Number.isInteger(deviceTypeValue) ? deviceTypeValue : 3;
  
  if (!code) {
    throw new AppError(40001, "参数错误: code 不能为空", 200);
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    const { user, wechatData } = await findOrCreateUserByWechat(conn, code);

    const tokenResult = await persistSessionTokensWithRetry(user.user_id, async ({
      accessToken,
      refreshToken,
      accessPayload,
      refreshPayload,
    }) => {
      await updateOrCreateLoginSession(conn, {
        user_id: user.user_id,
        session_key: wechatData.session_key,
        access_token: accessToken,
        refresh_token: refreshToken,
        access_expire_at: new Date(accessPayload.exp * 1000),
        refresh_expire_at: new Date(refreshPayload.exp * 1000),
        device_type: deviceType,
        device_id: deviceId,
        login_ip: req.ip,
        login_status: 1,
      });
    });

    await conn.commit();

    logger.info('wechat login succeeded', {
      requestId: req.requestId || null,
      userId: user.user_id,
      deviceType,
      deviceId,
      ip: req.ip,
    });

    res.status(200).json(
      ok(
        {
          accessToken: tokenResult.accessToken,
          refreshToken: tokenResult.refreshToken,
          user: toUserPayload(user),
        },
        "登录成功"
      )
    );
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 获取当前登录用户信息，并按角色附带扩展资料。
 * role=0 且志愿者资料不存在时，profile 返回 null。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 返回当前用户信息。
 */
export async function authMe(req, res) {
  const user = req.currentUser;
  const conn = await pool.getConnection();
  try {
    switch (user.role) {
      case 0:
      case 2:
      case 3:
        user.profile = await getVolunteerProfileByUserId(conn, user.user_id);
        break;
      case 1:
        user.profile = { placeholder: "临界少年专属信息，待实现" };
        break;
      default:
        user.profile = {};
    }
    return res.status(200).json(
      ok(
        {
          user: {
            ...toUserPayload(user),
            profile: user.profile || null,
          }
        },
        "获取成功"
      )
    );
  } finally {
    conn.release();
  }
}

/**
 * 刷新访问令牌：校验 refreshToken 后更新会话中的令牌信息。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 返回刷新结果响应。
 */
export async function refreshToken(req, res) {
  const body = req.body || {};
  const rawRefreshToken = typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";

  if (!rawRefreshToken) {
    throw new AppError(40001, "参数错误: refreshToken 不能为空", 200);
  }

  const conn = await pool.getConnection();
  
  try {
    await conn.beginTransaction();

    const payload = verifyRefreshToken(rawRefreshToken);

    const session = await getValidSessionByRefreshToken(conn, rawRefreshToken);

    // 一致性校验
    if (String(session.user_id) !== String(payload.sub)) {
      throw new AppError(40301, "刷新令牌不匹配", 200);
    }
    if (new Date() > new Date(session.refresh_expire_at)) {
      throw new AppError(40301, "刷新令牌已过期，请重新登录", 200);
    }

    const tokenResult = await persistSessionTokensWithRetry(session.user_id, async ({
      accessToken,
      refreshToken,
      accessPayload,
      refreshPayload,
    }) => {
      await updateTokensBySessionId(conn, {
        id: session.id,
        accessToken,
        refreshToken,
        accessExpireAt: new Date(accessPayload.exp * 1000),
        refreshExpireAt: new Date(refreshPayload.exp * 1000),
        login_ip: req.ip,
      });
    });

    await conn.commit();

    logger.info('token refresh succeeded', {
      requestId: req.requestId || null,
      userId: session.user_id,
      sessionId: session.id,
      ip: req.ip,
    });

    return res.status(200).json(
      ok({ accessToken: tokenResult.accessToken, refreshToken: tokenResult.refreshToken }, "刷新成功")
    );
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 用户登出：将当前登录会话置为失效状态。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 返回登出结果响应。
 */
export async function authLogout(req, res) {
  const session = req.currentSession;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await revokeSessionById(conn, { id: session.id });
    await conn.commit();

    logger.info('logout succeeded', {
      requestId: req.requestId || null,
      userId: session.user_id,
      sessionId: session.id,
      ip: req.ip,
    });

    return res.status(200).json(ok(null, "登出成功"));
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 获取当前用户昵称。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 返回当前昵称。
 */
export async function getMyNickname(req, res) {
  return res.status(200).json(
    ok(
      {
        nickname: req.currentUser.nickname || "",
      },
      "获取成功"
    )
  );
}

/**
 * 更新当前用户昵称。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 返回更新后的用户信息。
 */
export async function updateMyNickname(req, res) {
  const user = req.currentUser;
  const body = req.body || {};
  const nicknameRaw = typeof body.nickname === "string" ? body.nickname : "";

  if (nicknameRaw.trim() === "") {
    throw new AppError(40001, "参数错误: nickname 不能为空", 200);
  }
  
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const updatedUser = await updateUserBaseInfo(conn, user.user_id, {
      nickname: nicknameRaw.trim(),
      avatarUrl: user.avatar_url || "",
    });

    if (!updatedUser) {
      throw new AppError(40401, "用户不存在", 200);
    }

    await conn.commit();
    
    return res.status(200).json(
      ok(
        {
          user: toUserPayload(updatedUser),
        },
        "更新成功"
      )
    );
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 更新当前用户头像。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 返回更新后的用户信息。
 */
export async function updateMyAvatar(req, res) {
  const user = req.currentUser;
  const avatarFile = req.file;

  if (!avatarFile) {
    throw new AppError(40001, "参数错误: avatar 文件不能为空", 200);
  }

  const uploadResult = await uploadAvatarToObjectStorage(avatarFile, user.user_id);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const updatedUser = await updateUserBaseInfo(conn, user.user_id, {
      nickname: user.nickname || "",
      avatarUrl: uploadResult.key,
    });

    if (!updatedUser) {
      throw new AppError(40401, "用户不存在", 200);
    }

    await conn.commit();

    return res.status(200).json(
      ok(
        {
          user: toUserPayload(updatedUser),
        },
        "更新成功"
      )
    );
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 获取当前用户头像文件。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<void>} 直接返回头像二进制内容。
 */
export async function getMyAvatar(req, res) {
  const objectKey = resolveObjectStorageKey(req.currentUser.avatar_url);
  if (!objectKey) {
    throw new AppError(40401, "头像不存在", 200);
  }

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

/**
 * 创建或更新当前用户的志愿者资料。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 返回更新后的志愿者资料。
 */
export async function profile(req, res) {
  const user = req.currentUser;
  const body = req.body || {};
  const { name, studentId, phone } = body;
  
  if (typeof name !== "string" || name.trim() === "") {
    throw new AppError(40001, "参数错误: name 不能为空", 200);
  }
  if (typeof studentId !== "string" || studentId.trim() === "") {
    throw new AppError(40001, "参数错误: studentId 不能为空", 200);
  }
  if (typeof phone !== "string" || phone.trim() === "") {
    throw new AppError(40001, "参数错误: phone 不能为空", 200);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await createOrUpdateVolunteerProfile(conn, { user_id: user.user_id, name: name.trim(), student_id: studentId.trim(), phone: phone.trim() });
    const updatedProfile = await getVolunteerProfileByUserId(conn, user.user_id);
    await conn.commit();
    
    return res.status(200).json(
      ok(
        {
          profile: updatedProfile
        },
        "更新成功"
      )
    );
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 主动刷新当前志愿者的汇总字段。
 * 该接口不会修改头像、昵称或基础志愿者资料，只会重新全量汇总三项派生字段。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 刷新结果。
 */
export async function refreshProfileSummary(req, res) {
  const user = req.currentUser;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await refreshVolunteerProfileSummary(conn, user.user_id);
    await conn.commit();

    return res.status(200).json(
      ok(
        {
          profile: result.profile,
        },
        "刷新成功"
      )
    );
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

function parsePositiveIntOrUndefined(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(40001, `参数错误: ${fieldName} 必须是正整数`, 200);
  }
  return parsed;
}

function parseNonNegativeIntOrUndefined(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new AppError(40001, `参数错误: ${fieldName} 必须是非负整数`, 200);
  }
  return parsed;
}

/**
 * 查询当前用户参与过的项目。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 查询结果。
 */
export async function myProjects(req, res) {
  const query = req.query || {};
  const conn = await pool.getConnection();
  try {
    const result = await queryMyVolunteerProjects(conn, {
      userId: req.currentUser.user_id,
      projectStatus: parseNonNegativeIntOrUndefined(query.projectStatus, "projectStatus"),
      page: parsePositiveIntOrUndefined(query.page, "page"),
      pageSize: parsePositiveIntOrUndefined(query.pageSize, "pageSize"),
    });

    return res.status(200).json(ok(result, "查询成功"));
  } finally {
    conn.release();
  }
}