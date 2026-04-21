import { wechatCodeToSession } from "./wechatService.js";
import { AppError, isMysqlDuplicateKeyError } from "../utils/errors.js";
import {
  findUserByWechatOpenid,
  createUser,
  updateUserNickname,
  findUserById,
  updateUserById,
} from "../dao/userDao.js";
import { 
  findLoginSessionByUserId, 
  findLoginSessionByUserIdAndDeviceId,
  updateLoginSessionByUserId, 
  updateLoginSessionById,
  createLoginSession,
  findLoginSessionByRefreshToken,
  updateTokensBySessionId as updateSessionTokensBySessionId
} from "../dao/sessionDao.js"; 
import {
  findVolunteerByUserId,
  updateVolunteerByUserId,
  createVolunteer,
  refreshVolunteerDerivedFieldsByUserId,
} from "../dao/volunteerDao.js";
import { queryParticipantProjectsByUserId } from "../dao/volunteerProjectParticipantDao.js";

/**
 * 根据微信 code 查找或创建业务用户。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {string} code 微信登录 code。
 * @returns {Promise<{user:Object,wechatData:Object}>} 返回用户信息与微信会话信息。
 */
export async function findOrCreateUserByWechat(conn, code) {
  const wechatData = await wechatCodeToSession(code);

  const user = await findUserByWechatOpenid(conn, wechatData.openid);
  if (user) {
    if (user.status !== 1) {
      throw new AppError(40301, "账号被禁用", 200);
    }
    return { user, wechatData };
  }

  const userId = await createUser(conn, {
    openid: wechatData.openid,
    unionid: wechatData.unionid,
    nickname: "微信用户",
    avatar_url: "",
    role: 0,
  });
  const nickname = `微信用户${userId}`;

  await updateUserNickname(conn, userId, nickname);

  const createdUser = await findUserById(conn, userId);
  return { user: createdUser, wechatData };
}

/**
 * 按设备维度更新或创建登录会话，支持多设备并存。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {Object} data 会话写入参数。
 * @returns {Promise<void>} 无返回值。
 */
export async function updateOrCreateLoginSession(conn, data) {
  const session = data.device_id
    ? await findLoginSessionByUserIdAndDeviceId(conn, data.user_id, data.device_id)
    : await findLoginSessionByUserId(conn, data.user_id);

  if (session) {
    if (data.device_id) {
      await updateLoginSessionById(conn, {
        ...data,
        id: session.id,
      });
    } else {
      await updateLoginSessionByUserId(conn, data);
    }
  } else {
    await createLoginSession(conn, data);
  }
}

/**
 * 根据 refresh token 获取有效会话。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {string} refreshToken 刷新令牌。
 * @returns {Promise<Object>} 返回有效会话记录。
 */
export async function getValidSessionByRefreshToken(conn, refreshToken) {
  const session = await findLoginSessionByRefreshToken(conn, refreshToken);
  if (!session || session.login_status !== 1) {
    throw new AppError(40301, "会话不存在或已失效，请重新登录", 200);
  }
  if (new Date(session.refresh_expire_at) < new Date()) {
    throw new AppError(40302, "刷新令牌已过期，请重新登录", 200);
  }
  return session;
}

/**
 * 更新指定会话的 access/refresh token。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{id:number|string,accessToken:string,refreshToken:string,accessExpireAt:Date,refreshExpireAt:Date,login_ip:string|null}} data 令牌更新参数。
 * @returns {Promise<void>} 无返回值。
 */
export async function updateTokensBySessionId(conn, data) {
  await updateSessionTokensBySessionId(conn, {
    id: data.id,
    access_token: data.accessToken,
    refresh_token: data.refreshToken,
    access_expire_at: data.accessExpireAt,
    refresh_expire_at: data.refreshExpireAt,
    login_ip: data.login_ip,
  });
}

/**
 * 查询用户的志愿者资料。
 * 返回值包含基础资料以及由参与记录自动汇总的三个派生字段。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} userId 用户 ID。
 * @returns {Promise<{user_id:number,name:string,student_id:string,phone:string|null,volunteer_hours:string|number,project_count:number}|null>} 志愿者资料，不存在时返回 null。
 */
export async function getVolunteerProfileByUserId(conn, userId) {
  return await findVolunteerByUserId(conn, userId);
}

/**
 * 创建或更新志愿者资料（存在则更新，不存在则创建）。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{user_id:number|string,name:string,student_id:string,phone:string|null}} data 志愿者资料参数。
 * @returns {Promise<void>} 无返回值。
 */
export async function createOrUpdateVolunteerProfile(conn, { user_id, name, student_id, phone }) {
  try {
    const existingProfile = await findVolunteerByUserId(conn, user_id);
    if (existingProfile) {
      await updateVolunteerByUserId(conn, { user_id, name, student_id, phone });
    } else {
      await createVolunteer(conn, { user_id, name, student_id, phone });
    }
  } catch (error) {
    if (isMysqlDuplicateKeyError(error, "uk_student_id")) {
      throw new AppError(40001, "学号已存在", 200);
    }
    throw error;
  }

  await refreshVolunteerDerivedFieldsByUserId(conn, user_id);
}

/**
 * 重新从全量参与记录汇总志愿者三项派生字段。
 * 该操作按当前数据库中的全部参与记录重新计算，不依赖旧值加减。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} userId 用户 ID。
 * @returns {Promise<{profile: object|null}>} 刷新后的志愿者资料。
 */
export async function refreshVolunteerProfileSummary(conn, userId) {
  await refreshVolunteerDerivedFieldsByUserId(conn, userId);
  const profile = await findVolunteerByUserId(conn, userId);
  return { profile };
}

/**
 * 查询当前用户参与过的项目。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{userId:number|string,projectStatus?:number,page?:number,pageSize?:number}} input 查询参数。
 * @returns {Promise<{items: object[], total:number, page:number, pageSize:number}>} 分页结果。
 */
export async function queryMyVolunteerProjects(conn, input) {
  const page = Number.isInteger(input.page) && input.page > 0 ? input.page : 1;
  const pageSize = Number.isInteger(input.pageSize) && input.pageSize > 0 ? input.pageSize : 20;
  if (pageSize > 100) {
    throw new AppError(40001, "参数错误: pageSize 不能超过 100", 200);
  }
  if (input.projectStatus !== undefined && ![0, 1, 2].includes(input.projectStatus)) {
    throw new AppError(40001, "参数错误: projectStatus 仅支持 0, 1, 2", 200);
  }
  const { items, total } = await queryParticipantProjectsByUserId(conn, {
    userId: input.userId,
    projectStatus: input.projectStatus,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return {
    items,
    total,
    page,
    pageSize,
  };
}

/**
 * 更新用户基础资料并返回最新用户信息。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} userId 用户 ID。
 * @param {{nickname:string,avatarUrl:string}} data 资料参数。
 * @returns {Promise<{user_id:number,nickname:string,avatar_url:string,role:number,status:number}|null>} 更新后的用户信息。
 */
export async function updateUserBaseInfo(conn, userId, { nickname, avatarUrl }) {
  await updateUserById(conn, userId, {
    nickname,
    avatar_url: avatarUrl,
  });
  return await findUserById(conn, userId);
}