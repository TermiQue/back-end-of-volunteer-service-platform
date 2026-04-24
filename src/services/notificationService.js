import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { fetchObjectFromStorage } from "./objectStorageService.js";
import {
  createNotification,
  findNotificationByIdForReceiver,
  markNotificationReadById,
  queryNotificationsByReceiver,
  softDeleteNotificationById,
} from "../dao/notificationDao.js";

const WELCOME_VOLUNTEER_NOTIFICATION_TYPE = "欢迎-志愿者";
const CHECK_IN_NOTIFICATION_TYPE = "签到";
const CHECK_OUT_NOTIFICATION_TYPE = "签退";
const NOTIFICATION_TEMPLATE_OBJECT_KEY = "public/notifications.json";

function parsePositiveInt(value, fieldName) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new AppError(40001, `参数错误: ${fieldName} 必须为正整数`, 200);
  }
  return num;
}

function parseOptionalPositiveInt(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return parsePositiveInt(value, fieldName);
}

function parseNotificationExtraData(value) {
  if (value === null || value === undefined || value === "") {
    return {};
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (_error) {
      return {};
    }
  }

  if (typeof value === "object") {
    return value;
  }

  return {};
}

function normalizeNotificationItem(item) {
  return {
    ...item,
    extra_data: parseNotificationExtraData(item?.extra_data),
  };
}

function fillTemplatePlaceholders(content, placeholders) {
  let result = String(content || "");
  for (const [key, value] of Object.entries(placeholders || {})) {
    const safeValue = value === undefined || value === null ? "" : String(value);
    result = result.split(`{${key}}`).join(safeValue);
  }
  return result;
}

function formatNotificationDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function loadNotificationTemplates() {
  const objectFile = await fetchObjectFromStorage(NOTIFICATION_TEMPLATE_OBJECT_KEY);

  let parsed;
  try {
    parsed = JSON.parse(objectFile.body.toString("utf8"));
  } catch (_error) {
    throw new AppError(50000, "通知模板文件格式错误", 500);
  }

  if (!Array.isArray(parsed)) {
    throw new AppError(50000, "通知模板文件格式错误", 500);
  }

  return parsed;
}

async function loadNotificationTemplateByType(type) {
  const templates = await loadNotificationTemplates();
  const template = templates.find((item) => item && String(item.type || "").trim() === type);

  if (!template) {
    throw new AppError(50000, `通知模板不存在: ${type}`, 500);
  }

  const title = typeof template.title === "string" ? template.title.trim() : "";
  const content = typeof template.content === "string" ? template.content.trim() : "";

  if (!title || !content) {
    throw new AppError(50000, `通知模板内容不完整: ${type}`, 500);
  }

  return {
    type,
    title,
    content,
    extra_data: template.extra_data && typeof template.extra_data === "object" ? template.extra_data : {},
    redirect_url: typeof template.redirect_url === "string" ? template.redirect_url.trim() : "",
  };
}

async function createNotificationFromTemplate(conn, input) {
  const template = await loadNotificationTemplateByType(input.type);
  const mergedExtraData = {
    ...(template.extra_data && typeof template.extra_data === "object" ? template.extra_data : {}),
    ...(input.extraData && typeof input.extraData === "object" ? input.extraData : {}),
  };

  return await createNotification(conn, {
    type: template.type,
    title: input.title || template.title,
    content: fillTemplatePlaceholders(template.content, input.placeholders),
    sender_id: input.senderId ?? null,
    receiver_id: input.receiverId,
    extra_data: mergedExtraData,
    redirect_url: input.redirectUrl ?? template.redirect_url,
  });
}

/**
 * 新用户注册后创建欢迎通知。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} receiverId 接收人用户 ID。
 * @returns {Promise<number>} 新增通知 ID。
 */
export async function createWelcomeVolunteerNotification(conn, receiverId) {
  return await createNotificationFromTemplate(conn, {
    type: WELCOME_VOLUNTEER_NOTIFICATION_TYPE,
    receiverId,
  });
}

/**
 * 创建签到成功通知。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{receiverId:number|string,date:Date|string,obj:string,extraData?:object}} input 通知参数。
 * @returns {Promise<number>} 新增通知 ID。
 */
export async function createCheckInNotification(conn, input) {
  return await createNotificationFromTemplate(conn, {
    type: CHECK_IN_NOTIFICATION_TYPE,
    receiverId: input.receiverId,
    placeholders: {
      date: formatNotificationDateTime(input.date),
      obj: input.obj,
    },
    extraData: input.extraData,
  });
}

/**
 * 创建签退成功通知。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{receiverId:number|string,date:Date|string,obj:string,extraData?:object}} input 通知参数。
 * @returns {Promise<number>} 新增通知 ID。
 */
export async function createCheckOutNotification(conn, input) {
  return await createNotificationFromTemplate(conn, {
    type: CHECK_OUT_NOTIFICATION_TYPE,
    receiverId: input.receiverId,
    placeholders: {
      date: formatNotificationDateTime(input.date),
      obj: input.obj,
    },
    extraData: input.extraData,
  });
}

/**
 * 查询当前用户通知列表。
 * @param {{page?:number|string,pageSize?:number|string,currentUser:{user_id:number|string}}} input 查询参数。
 * @returns {Promise<{items:object[],total:number,unreadCount:number,page:number,pageSize:number}>} 分页结果。
 */
export async function queryMyNotifications(input) {
  const pageRaw = parseOptionalPositiveInt(input.page, "page");
  const pageSizeRaw = parseOptionalPositiveInt(input.pageSize, "pageSize");
  const page = pageRaw ?? 1;
  const pageSize = pageSizeRaw ?? 20;
  if (pageSize > 100) {
    throw new AppError(40001, "参数错误: pageSize 不能超过 100", 200);
  }

  const conn = await pool.getConnection();
  try {
    const { items, total, unreadCount } = await queryNotificationsByReceiver(conn, {
      receiverId: parsePositiveInt(input.currentUser?.user_id, "user_id"),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return {
      items: items.map(normalizeNotificationItem),
      total,
      unreadCount,
      page,
      pageSize,
    };
  } finally {
    conn.release();
  }
}

/**
 * 标记当前用户通知为已读。
 * @param {{notificationId:number|string,currentUser:{user_id:number|string}}} input 操作参数。
 * @returns {Promise<{notification:object}>} 已读后的通知。
 */
export async function markMyNotificationRead(input) {
  const notificationId = parsePositiveInt(input.notificationId, "notificationId");
  const receiverId = parsePositiveInt(input.currentUser?.user_id, "user_id");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const existing = await findNotificationByIdForReceiver(conn, {
      id: notificationId,
      receiverId,
    });
    if (!existing) {
      throw new AppError(40401, "通知不存在", 200);
    }

    if (Number(existing.is_read) !== 1) {
      await markNotificationReadById(conn, {
        id: notificationId,
        receiverId,
      });
    }

    const updated = await findNotificationByIdForReceiver(conn, {
      id: notificationId,
      receiverId,
    });

    await conn.commit();
    return {
      notification: normalizeNotificationItem(updated),
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 软删除当前用户通知。
 * @param {{notificationId:number|string,currentUser:{user_id:number|string}}} input 操作参数。
 * @returns {Promise<void>} 无返回值。
 */
export async function softDeleteMyNotification(input) {
  const notificationId = parsePositiveInt(input.notificationId, "notificationId");
  const receiverId = parsePositiveInt(input.currentUser?.user_id, "user_id");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const existing = await findNotificationByIdForReceiver(conn, {
      id: notificationId,
      receiverId,
    });
    if (!existing) {
      throw new AppError(40401, "通知不存在", 200);
    }

    await softDeleteNotificationById(conn, {
      id: notificationId,
      receiverId,
    });

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
