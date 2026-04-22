import crypto from "crypto";
import ExcelJS from "exceljs";

import { pool } from "../config/db.js";
import {
  createVolunteerProject,
  findVolunteerProjectByProjectId,
  queryVolunteerProjects,
  transitionVolunteerProjectStatus,
  updateProjectResponsibleByProjectId,
} from "../dao/volunteerProjectDao.js";
import {
  consumeQrToken,
  createQrToken,
  findLatestActiveQrToken,
  findQrTokenByToken,
} from "../dao/volunteerProjectQrTokenDao.js";
import {
  applyParticipantAutoSettlement,
  findParticipantRecord,
  findParticipantRecordById,
  listParticipantRecordsByProjectId,
  markParticipantInvalidWithNote,
  queryAllParticipantProjectsByUserId,
  queryParticipantExportRowsByProjectId,
  upsertParticipantCheckIn,
  upsertParticipantCheckOut,
  updateParticipantSettlementById,
} from "../dao/volunteerProjectParticipantDao.js";
import {
  adjustVolunteerHoursByDelta,
  findVolunteerDetailByUserIdForAdmin,
  incrementVolunteerSummaryByUserId,
  queryVolunteersForAdmin,
} from "../dao/volunteerDao.js";
import {
  findActiveAdminByUserId,
  findUserById,
  queryAllAdminProfiles,
  updateUserRoleById,
} from "../dao/userDao.js";
import {
  createAppeal,
  findAppealById,
  findPendingAppealByApplicantAndProject,
  findPendingAppealByParticipantId,
  queryAppeals,
  queryAppealsByApplicant,
  reviewAppealById,
} from "../dao/appealDao.js";
import { AppError, isMysqlDuplicateKeyError } from "../utils/errors.js";

export const PROJECT_QR_CODE_TYPE = {
  CHECK_IN: 1,
  CHECK_OUT: 2,
};

const ATTENDANCE_SOURCE = {
  QR: "qr",
  ADMIN_AUTO: "admin_auto",
};

const APPEAL_TYPE = {
  INVALID_RECORD: 1,
  CHANGE_SETTLEMENT: 2,
};

const APPEAL_TARGET_TYPE = {
  INVALID_RECORD: 1,
  CHANGE_SETTLEMENT: 2,
};

const APPEAL_STATUS = {
  PENDING: 0,
  APPROVED: 1,
  REJECTED: 2,
};

const QR_TOKEN_RETRY_LIMIT = 5;

function parseDateTimeField(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AppError(40001, `参数错误: ${fieldName} 不能为空`, 200);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(40001, `参数错误: ${fieldName} 格式非法`, 200);
  }

  return date;
}

function normalizeHalfHour(hours) {
  return Number((Math.ceil(hours * 2) / 2).toFixed(1));
}

function parseDurationHours(value, fieldName = "durationHours") {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new AppError(40001, `参数错误: ${fieldName} 必须是大于 0 的数字`, 200);
  }
  return normalizeHalfHour(hours);
}

function parseAppealHours(value, fieldName = "time") {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new AppError(40001, `参数错误: ${fieldName} 必须是大于 0 的数字`, 200);
  }

  const scaled = hours * 10;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-8) {
    throw new AppError(40001, `参数错误: ${fieldName} 最多保留 1 位小数`, 200);
  }

  return Number(hours.toFixed(1));
}

function parseOptionalBoolean(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n"].includes(normalized)) {
      return false;
    }
  }

  throw new AppError(40001, `参数错误: ${fieldName} 必须是布尔值`, 200);
}

function parseOptionalPositiveInt(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(40001, `参数错误: ${fieldName} 必须是正整数`, 200);
  }
  return parsed;
}

function parseOptionalNonNegativeInt(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new AppError(40001, `参数错误: ${fieldName} 必须是非负整数`, 200);
  }
  return parsed;
}

function parseAppealStatusFilter(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "string" && value.trim().toLowerCase() === "all") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || ![0, 1, 2].includes(parsed)) {
    throw new AppError(40001, "参数错误: status 仅支持 all, 0, 1, 2", 200);
  }
  return parsed;
}

function parseOptionalNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError(40001, `参数错误: ${fieldName} 必须是数字`, 200);
  }
  return parsed;
}

function parseOptionalDateTime(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(40001, `参数错误: ${fieldName} 格式非法`, 200);
  }
  return date;
}

function parsePositiveInt(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(40001, `参数错误: ${fieldName} 必须是正整数`, 200);
  }
  return parsed;
}

function formatHoursForExport(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0) {
    return "";
  }
  if (Math.abs(hours - Math.round(hours)) < 1e-8) {
    return String(Math.round(hours));
  }
  return Number(hours.toFixed(1)).toString();
}

function sanitizeFileNamePart(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim();
}

function getTimestampForFileName(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hour}${minute}${second}`;
}

function ensureProjectInProgress(project) {
  if (project.status !== 1) {
    throw new AppError(40001, "项目未处于进行中状态", 200);
  }
}

function ensureSuperAdmin(user) {
  if (!user || user.role !== 3) {
    throw new AppError(40301, "权限不足，仅超级管理员可操作", 200);
  }
}

function ensureProjectResponsibleOrSuperAdmin(project, operatorUser, actionName) {
  if (!operatorUser) {
    throw new AppError(40101, "未登录", 200);
  }
  if (operatorUser.role === 3) {
    return;
  }
  if (operatorUser.role === 2 && Number(operatorUser.user_id) === Number(project.responsible_id)) {
    return;
  }
  throw new AppError(40301, `权限不足，仅项目负责人或超级管理员可${actionName}`, 200);
}

function validateCheckOutAfterCheckIn(checkInAt, checkOutAt) {
  if (!checkInAt || !checkOutAt) {
    return;
  }
  const inDate = new Date(checkInAt);
  const outDate = new Date(checkOutAt);
  if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime()) || outDate <= inDate) {
    throw new AppError(40001, "签退时间必须晚于签到时间", 200);
  }
}

function makeQrToken() {
  return crypto.randomBytes(24).toString("hex");
}

function getResponsibleAutoCheckInTime(project) {
  const now = new Date();
  const startTime = new Date(project.start_time);
  if (Number.isNaN(startTime.getTime())) {
    return now;
  }
  return startTime > now ? now : startTime;
}

function computeSettlementHours(projectDurationHours, checkInAt, checkOutAt) {
  const checkIn = new Date(checkInAt);
  const checkOut = new Date(checkOutAt);
  const durationHours = Number(projectDurationHours);

  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
    throw new AppError(40001, "签到签退时间非法，无法结算", 200);
  }
  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    throw new AppError(50000, "项目时长配置非法", 200);
  }
  if (checkOut <= checkIn) {
    throw new AppError(40001, "签退时间必须晚于签到时间", 200);
  }

  const actualHours = (checkOut.getTime() - checkIn.getTime()) / 3600000;
  const rounded = normalizeHalfHour(actualHours);
  const finalHours = Math.min(rounded, durationHours);
  return Number(finalHours.toFixed(1));
}

async function getProjectOrThrow(conn, projectId) {
  const project = await findVolunteerProjectByProjectId(conn, projectId);
  if (!project) {
    throw new AppError(40401, "项目不存在", 200);
  }
  return project;
}

async function settleParticipantIfReady(conn, project, participant, note = "auto-settlement") {
  if (!participant?.check_in_at || !participant?.check_out_at) {
    return false;
  }

  validateCheckOutAfterCheckIn(participant.check_in_at, participant.check_out_at);
  const settlementHours = computeSettlementHours(
    project.duration_hours,
    participant.check_in_at,
    participant.check_out_at
  );

  const affectedRows = await applyParticipantAutoSettlement(conn, {
    participantId: participant.id,
    settlementHours,
    note,
  });

  if (affectedRows > 0) {
    await incrementVolunteerSummaryByUserId(conn, participant.user_id, settlementHours);
  }

  return affectedRows > 0;
}

async function ensureResponsibleAutoCheckInOnFirstVolunteerCheckIn(conn, project) {
  const participants = await listParticipantRecordsByProjectId(conn, project.project_id);

  const hasVolunteerCheckedIn = participants.some(
    (item) => Number(item.user_id) !== Number(project.responsible_id) && item.check_in_at
  );

  if (hasVolunteerCheckedIn) {
    return;
  }

  const responsibleRecord = participants.find(
    (item) => Number(item.user_id) === Number(project.responsible_id)
  );

  if (responsibleRecord?.check_in_at) {
    return;
  }

  await upsertParticipantCheckIn(conn, {
    projectId: project.project_id,
    userId: project.responsible_id,
    source: ATTENDANCE_SOURCE.ADMIN_AUTO,
    checkInAt: getResponsibleAutoCheckInTime(project),
  });
}

async function createUniqueQrToken(conn, { projectId, codeType, createdBy }) {
  for (let attempt = 0; attempt < QR_TOKEN_RETRY_LIMIT; attempt += 1) {
    const token = makeQrToken();
    try {
      await createQrToken(conn, {
        project_id: projectId,
        code_type: codeType,
        token,
        created_by: createdBy,
      });
      return;
    } catch (error) {
      if (!isMysqlDuplicateKeyError(error, "uk_token")) {
        throw error;
      }
    }
  }

  throw new AppError(50000, "二维码生成失败，请重试", 200);
}

/**
 * 超级管理员创建志愿项目草稿。
 * @param {{name:string,description?:string,startTime:string,endTime:string,durationHours:number|string,createdBy:number|string,currentUserRole:number,responsibleId:number|string}} input 创建参数。
 * @returns {Promise<object>} 创建后的项目详情。
 */
export async function createVolunteerProjectDraft(input) {
  if (input.currentUserRole !== 3) {
    throw new AppError(40301, "权限不足，仅超级管理员可创建项目", 200);
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const responsibleId = parsePositiveInt(input.responsibleId, "responsibleId");

  if (!name) {
    throw new AppError(40001, "参数错误: name 不能为空", 200);
  }
  if (name.length > 200) {
    throw new AppError(40001, "参数错误: name 长度不能超过 200", 200);
  }

  const startTime = parseDateTimeField(input.startTime, "startTime");
  const endTime = parseDateTimeField(input.endTime, "endTime");
  if (endTime <= startTime) {
    throw new AppError(40001, "参数错误: endTime 必须晚于 startTime", 200);
  }

  const durationHours = parseDurationHours(input.durationHours);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const responsibleUser = await findActiveAdminByUserId(conn, responsibleId);
    if (!responsibleUser) {
      throw new AppError(40001, "负责人必须是有效的管理员或超级管理员", 200);
    }

    const projectId = await createVolunteerProject(conn, {
      name,
      description,
      start_time: startTime,
      end_time: endTime,
      duration_hours: durationHours,
      status: 0,
      created_by_id: input.createdBy,
      responsible_id: responsibleId,
    });

    const project = await findVolunteerProjectByProjectId(conn, projectId);
    await conn.commit();

    return project;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 管理员多条件查询志愿项目。
 * @param {{
 *   projectId?:number|string,
 *   name?:string,
 *   startTimeFrom?:string,
 *   startTimeTo?:string,
 *   endTimeFrom?:string,
 *   endTimeTo?:string,
 *   durationHoursMin?:number|string,
 *   durationHoursMax?:number|string,
 *   status?:number|string,
 *   createdById?:number|string,
 *   responsibleId?:number|string,
 *   createdTimeFrom?:string,
 *   createdTimeTo?:string,
 *   page?:number|string,
 *   pageSize?:number|string,
 * }} input 查询参数。
 * @returns {Promise<{items: object[], total:number, page:number, pageSize:number}>} 分页结果。
 */
export async function searchVolunteerProjects(input) {
  const pageRaw = parseOptionalPositiveInt(input.page, "page");
  const pageSizeRaw = parseOptionalPositiveInt(input.pageSize, "pageSize");
  const page = pageRaw ?? 1;
  const pageSize = pageSizeRaw ?? 20;

  if (pageSize > 100) {
    throw new AppError(40001, "参数错误: pageSize 不能超过 100", 200);
  }

  const filters = {
    projectId: parseOptionalPositiveInt(input.projectId, "projectId"),
    name: typeof input.name === "string" ? input.name.trim() : undefined,
    startTimeFrom: parseOptionalDateTime(input.startTimeFrom, "startTimeFrom"),
    startTimeTo: parseOptionalDateTime(input.startTimeTo, "startTimeTo"),
    endTimeFrom: parseOptionalDateTime(input.endTimeFrom, "endTimeFrom"),
    endTimeTo: parseOptionalDateTime(input.endTimeTo, "endTimeTo"),
    durationHoursMin: parseOptionalNumber(input.durationHoursMin, "durationHoursMin"),
    durationHoursMax: parseOptionalNumber(input.durationHoursMax, "durationHoursMax"),
    status: parseOptionalNonNegativeInt(input.status, "status"),
    createdById: parseOptionalPositiveInt(input.createdById, "createdById"),
    responsibleId: parseOptionalPositiveInt(input.responsibleId, "responsibleId"),
    createdTimeFrom: parseOptionalDateTime(input.createdTimeFrom, "createdTimeFrom"),
    createdTimeTo: parseOptionalDateTime(input.createdTimeTo, "createdTimeTo"),
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };

  if (filters.status !== undefined && ![0, 1, 2].includes(filters.status)) {
    throw new AppError(40001, "参数错误: status 仅支持 0, 1, 2", 200);
  }
  if (filters.durationHoursMin !== undefined && filters.durationHoursMin < 0) {
    throw new AppError(40001, "参数错误: durationHoursMin 不能小于 0", 200);
  }
  if (filters.durationHoursMax !== undefined && filters.durationHoursMax < 0) {
    throw new AppError(40001, "参数错误: durationHoursMax 不能小于 0", 200);
  }
  if (
    filters.durationHoursMin !== undefined &&
    filters.durationHoursMax !== undefined &&
    filters.durationHoursMin > filters.durationHoursMax
  ) {
    throw new AppError(40001, "参数错误: durationHoursMin 不能大于 durationHoursMax", 200);
  }
  if (filters.startTimeFrom && filters.startTimeTo && filters.startTimeFrom > filters.startTimeTo) {
    throw new AppError(40001, "参数错误: startTimeFrom 不能晚于 startTimeTo", 200);
  }
  if (filters.endTimeFrom && filters.endTimeTo && filters.endTimeFrom > filters.endTimeTo) {
    throw new AppError(40001, "参数错误: endTimeFrom 不能晚于 endTimeTo", 200);
  }
  if (filters.createdTimeFrom && filters.createdTimeTo && filters.createdTimeFrom > filters.createdTimeTo) {
    throw new AppError(40001, "参数错误: createdTimeFrom 不能晚于 createdTimeTo", 200);
  }

  const conn = await pool.getConnection();
  try {
    const { items, total } = await queryVolunteerProjects(conn, filters);
    return {
      items,
      total,
      page,
      pageSize,
    };
  } finally {
    conn.release();
  }
}

/**
 * 超级管理员修改项目负责人。
 * @param {{projectId:number|string,responsibleId:number|string,operatorUser:{user_id:number|string,role:number}}} input 更新参数。
 * @returns {Promise<object>} 更新后的项目信息。
 */
export async function updateProjectResponsible(input) {
  ensureSuperAdmin(input.operatorUser);
  const projectId = parsePositiveInt(input.projectId, "projectId");
  const responsibleId = parsePositiveInt(input.responsibleId, "responsibleId");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const project = await getProjectOrThrow(conn, projectId);
    if (project.status === 2) {
      throw new AppError(40001, "项目已结束，不允许变更负责人", 200);
    }

    const responsibleUser = await findActiveAdminByUserId(conn, responsibleId);
    if (!responsibleUser) {
      throw new AppError(40001, "负责人必须是有效的管理员或超级管理员", 200);
    }

    await updateProjectResponsibleByProjectId(conn, projectId, responsibleId);

    const updated = await findVolunteerProjectByProjectId(conn, projectId);
    await conn.commit();
    return updated;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 手动开启项目，仅允许 0->1。
 * @param {number|string} projectId 项目 ID。
 * @param {{user_id:number|string,role:number}} operatorUser 操作人。
 * @returns {Promise<object>} 更新后的项目详情。
 */
export async function startVolunteerProject(projectId, operatorUser) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const project = await getProjectOrThrow(conn, projectId);
    ensureProjectResponsibleOrSuperAdmin(project, operatorUser, "开启项目");

    const affectedRows = await transitionVolunteerProjectStatus(conn, project.project_id, 0, 1);

    if (affectedRows === 0) {
      if (project.status === 1) {
        throw new AppError(40001, "项目已开启，无需重复操作", 200);
      }
      if (project.status === 2) {
        throw new AppError(40001, "项目已结束，不能重新开启", 200);
      }
      throw new AppError(40001, "项目状态非法，无法开启", 200);
    }

    const updated = await findVolunteerProjectByProjectId(conn, project.project_id);
    await conn.commit();
    return updated;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 手动结束项目，仅允许 1->2。
 * @param {number|string} projectId 项目 ID。
 * @param {{user_id:number|string,role:number}} operatorUser 操作人。
 * @returns {Promise<object>} 更新后的项目详情。
 */
export async function endVolunteerProject(projectId, operatorUser) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const project = await getProjectOrThrow(conn, projectId);
    ensureProjectResponsibleOrSuperAdmin(project, operatorUser, "结束项目");

    const affectedRows = await transitionVolunteerProjectStatus(conn, project.project_id, 1, 2);

    if (affectedRows === 0) {
      if (project.status === 0) {
        throw new AppError(40001, "项目尚未开启，不能直接结束", 200);
      }
      if (project.status === 2) {
        throw new AppError(40001, "项目已结束，无需重复操作", 200);
      }
      throw new AppError(40001, "项目状态非法，无法结束", 200);
    }

    let responsibleParticipant = await findParticipantRecord(
      conn,
      project.project_id,
      project.responsible_id
    );

    if (!responsibleParticipant?.check_in_at) {
      await upsertParticipantCheckIn(conn, {
        projectId: project.project_id,
        userId: project.responsible_id,
        source: ATTENDANCE_SOURCE.ADMIN_AUTO,
        checkInAt: getResponsibleAutoCheckInTime(project),
      });
      responsibleParticipant = await findParticipantRecord(
        conn,
        project.project_id,
        project.responsible_id
      );
    }

    const responsibleCheckOutAt = new Date(project.end_time);
    if (responsibleParticipant?.check_in_at) {
      validateCheckOutAfterCheckIn(responsibleParticipant.check_in_at, responsibleCheckOutAt);
    }

    await upsertParticipantCheckOut(conn, {
      projectId: project.project_id,
      userId: project.responsible_id,
      source: ATTENDANCE_SOURCE.ADMIN_AUTO,
      checkOutAt: responsibleCheckOutAt,
    });

    const participants = await listParticipantRecordsByProjectId(conn, project.project_id);
    for (const participant of participants) {
      if (participant.check_in_at && participant.check_out_at) {
        await settleParticipantIfReady(conn, project, participant, "auto-settlement");
        continue;
      }

      if (participant.check_in_at && !participant.check_out_at) {
        await markParticipantInvalidWithNote(conn, {
          participantId: participant.id,
          note: "未签退",
        });
        continue;
      }

      if (!participant.check_in_at && participant.check_out_at) {
        await markParticipantInvalidWithNote(conn, {
          participantId: participant.id,
          note: "签到记录缺失",
        });
      }
    }

    const updated = await findVolunteerProjectByProjectId(conn, project.project_id);
    await conn.commit();
    return updated;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 管理员分页查询志愿者（支持多条件筛选）。
 * @param {{name?:string,studentId?:string,volunteerHoursMin?:number|string,volunteerHoursMax?:number|string,projectCountMin?:number|string,projectCountMax?:number|string,page?:number|string,pageSize?:number|string}} input 查询参数。
 * @returns {Promise<{items: object[], total:number, page:number, pageSize:number}>} 分页结果。
 */
export async function searchVolunteersForAdmin(input) {
  const pageRaw = parseOptionalPositiveInt(input.page, "page");
  const pageSizeRaw = parseOptionalPositiveInt(input.pageSize, "pageSize");
  const page = pageRaw ?? 1;
  const pageSize = pageSizeRaw ?? 20;

  if (pageSize > 100) {
    throw new AppError(40001, "参数错误: pageSize 不能超过 100", 200);
  }

  const filters = {
    name: typeof input.name === "string" ? input.name.trim() : undefined,
    studentId: typeof input.studentId === "string" ? input.studentId.trim() : undefined,
    volunteerHoursMin: parseOptionalNumber(input.volunteerHoursMin, "volunteerHoursMin"),
    volunteerHoursMax: parseOptionalNumber(input.volunteerHoursMax, "volunteerHoursMax"),
    projectCountMin: parseOptionalNonNegativeInt(input.projectCountMin, "projectCountMin"),
    projectCountMax: parseOptionalNonNegativeInt(input.projectCountMax, "projectCountMax"),
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };

  if (filters.volunteerHoursMin !== undefined && filters.volunteerHoursMin < 0) {
    throw new AppError(40001, "参数错误: volunteerHoursMin 不能小于 0", 200);
  }
  if (filters.volunteerHoursMax !== undefined && filters.volunteerHoursMax < 0) {
    throw new AppError(40001, "参数错误: volunteerHoursMax 不能小于 0", 200);
  }
  if (
    filters.volunteerHoursMin !== undefined &&
    filters.volunteerHoursMax !== undefined &&
    filters.volunteerHoursMin > filters.volunteerHoursMax
  ) {
    throw new AppError(40001, "参数错误: volunteerHoursMin 不能大于 volunteerHoursMax", 200);
  }
  if (
    filters.projectCountMin !== undefined &&
    filters.projectCountMax !== undefined &&
    filters.projectCountMin > filters.projectCountMax
  ) {
    throw new AppError(40001, "参数错误: projectCountMin 不能大于 projectCountMax", 200);
  }

  const conn = await pool.getConnection();
  try {
    const { items, total } = await queryVolunteersForAdmin(conn, filters);
    return {
      items,
      total,
      page,
      pageSize,
    };
  } finally {
    conn.release();
  }
}

/**
 * 管理员查看单个志愿者详情（含全部参与项目）。
 * @param {number|string} userId 用户 ID。
 * @returns {Promise<{volunteer: object, projects: object[]}>} 志愿者详情与项目列表。
 */
export async function getVolunteerDetailForAdmin(userId) {
  const parsedUserId = parseOptionalPositiveInt(userId, "userId");
  if (!parsedUserId) {
    throw new AppError(40001, "参数错误: userId 必须是正整数", 200);
  }

  const conn = await pool.getConnection();
  try {
    const volunteer = await findVolunteerDetailByUserIdForAdmin(conn, parsedUserId);
    if (!volunteer) {
      throw new AppError(40401, "志愿者不存在", 200);
    }

    const projects = await queryAllParticipantProjectsByUserId(conn, parsedUserId);
    return {
      volunteer,
      projects,
    };
  } finally {
    conn.release();
  }
}

/**
 * 导出项目参与信息 Excel。
 * 超级管理员可导出任意项目，管理员仅可导出自己负责的项目。
 * @param {{projectId:number|string,operatorUser:{user_id:number|string,role:number}}} input 导出参数。
 * @returns {Promise<{fileName:string,buffer:Buffer}>} 导出文件信息。
 */
export async function exportProjectParticipantsExcel(input) {
  const projectId = parsePositiveInt(input.projectId, "projectId");

  if (!input.operatorUser || ![2, 3].includes(Number(input.operatorUser.role))) {
    throw new AppError(40301, "权限不足，仅管理员或超级管理员可操作", 200);
  }

  const conn = await pool.getConnection();
  try {
    const project = await getProjectOrThrow(conn, projectId);

    if (Number(project.status) !== 2) {
      throw new AppError(40001, "仅已结束项目可导出参与信息", 200);
    }

    if (
      Number(input.operatorUser.role) === 2 &&
      Number(input.operatorUser.user_id) !== Number(project.responsible_id)
    ) {
      throw new AppError(40301, "权限不足，仅可导出自己负责的项目", 200);
    }

    const rows = await queryParticipantExportRowsByProjectId(conn, projectId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("参与信息");
    sheet.columns = [
      { header: "姓名", key: "name", width: 20 },
      { header: "*学号", key: "studentId", width: 24 },
      { header: "*时长/h", key: "hours", width: 12 },
    ];

    for (const item of rows) {
      const row = sheet.addRow({
        name: item.name || "",
        studentId: item.student_id || "",
        hours: formatHoursForExport(item.settlement_hours),
      });
      // 学号按文本写入，避免 Excel 自动转数字或科学计数法。
      row.getCell(2).numFmt = "@";
    }

    const projectNameSafe = sanitizeFileNamePart(project.name || "项目");
    const timestamp = getTimestampForFileName();
    const fileName = `${projectNameSafe}_${project.project_id}_${timestamp}.xlsx`;

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(arrayBuffer)
      ? arrayBuffer
      : Buffer.from(arrayBuffer);

    return {
      fileName,
      buffer,
    };
  } finally {
    conn.release();
  }
}

/**
 * 超级管理员查询全部管理员信息（含超级管理员）。
 * @param {{user_id:number|string,role:number}} operatorUser 当前用户。
 * @returns {Promise<object[]>} 管理员列表。
 */
export async function queryAdminProfilesForSuperAdmin(operatorUser) {
  ensureSuperAdmin(operatorUser);
  const conn = await pool.getConnection();
  try {
    return await queryAllAdminProfiles(conn);
  } finally {
    conn.release();
  }
}

/**
 * 超级管理员提升志愿者为管理员。
 * @param {{userId:number|string,operatorUser:{user_id:number|string,role:number}}} input 参数。
 * @returns {Promise<object>} 更新后的用户信息。
 */
export async function promoteVolunteerToAdmin(input) {
  ensureSuperAdmin(input.operatorUser);
  const userId = parsePositiveInt(input.userId, "userId");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const user = await findUserById(conn, userId);
    if (!user) {
      throw new AppError(40401, "用户不存在", 200);
    }
    if (user.status !== 1) {
      throw new AppError(40001, "账号状态异常，无法调整角色", 200);
    }
    if (user.role === 3) {
      throw new AppError(40001, "超级管理员无需提升", 200);
    }
    if (user.role === 2) {
      throw new AppError(40001, "该用户已是管理员", 200);
    }

    await updateUserRoleById(conn, userId, 2);
    const updated = await findUserById(conn, userId);

    await conn.commit();
    return updated;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 超级管理员降低管理员为志愿者。
 * @param {{userId:number|string,operatorUser:{user_id:number|string,role:number}}} input 参数。
 * @returns {Promise<object>} 更新后的用户信息。
 */
export async function demoteAdminToVolunteer(input) {
  ensureSuperAdmin(input.operatorUser);
  const userId = parsePositiveInt(input.userId, "userId");

  if (Number(userId) === Number(input.operatorUser.user_id)) {
    throw new AppError(40001, "不能降低当前登录的超级管理员", 200);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const user = await findUserById(conn, userId);
    if (!user) {
      throw new AppError(40401, "用户不存在", 200);
    }
    if (user.status !== 1) {
      throw new AppError(40001, "账号状态异常，无法调整角色", 200);
    }
    if (user.role === 3) {
      throw new AppError(40001, "不能降低超级管理员", 200);
    }
    if (user.role !== 2) {
      throw new AppError(40001, "该用户不是管理员", 200);
    }

    await updateUserRoleById(conn, userId, 0);
    const updated = await findUserById(conn, userId);

    await conn.commit();
    return updated;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 获取项目签到/签退二维码 token。
 * 同一项目同一类型在未被扫码前重复请求，返回同一个 token；被扫码后再请求会生成新 token。
 * @param {{projectId:number|string,operatorUser:{user_id:number|string,role:number},codeType:number}} input 参数。
 * @returns {Promise<object>} 二维码数据。
 */
export async function getProjectQrToken(input) {
  if (![PROJECT_QR_CODE_TYPE.CHECK_IN, PROJECT_QR_CODE_TYPE.CHECK_OUT].includes(input.codeType)) {
    throw new AppError(40001, "二维码类型非法", 200);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const project = await getProjectOrThrow(conn, input.projectId);
    ensureProjectInProgress(project);

    if (
      input.operatorUser.role !== 3 &&
      Number(input.operatorUser.user_id) !== Number(project.responsible_id)
    ) {
      throw new AppError(40301, "权限不足，仅项目负责人或超级管理员可生成二维码", 200);
    }

    let activeToken = await findLatestActiveQrToken(conn, project.project_id, input.codeType);

    if (!activeToken) {
      await createUniqueQrToken(conn, {
        projectId: project.project_id,
        codeType: input.codeType,
        createdBy: input.operatorUser.user_id,
      });
      activeToken = await findLatestActiveQrToken(conn, project.project_id, input.codeType);
      if (!activeToken) {
        throw new AppError(50000, "二维码创建失败", 200);
      }
    }

    await conn.commit();
    return {
      projectId: project.project_id,
      codeType: activeToken.code_type,
      token: activeToken.token,
      createdAt: activeToken.created_at,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 志愿者扫码确认签到/签退。
 * 二维码仅可使用一次，消费后立即失效。
 * @param {{token:string,userId:number|string}} input 扫码参数。
 * @returns {Promise<object>} 扫码结果。
 */
export async function scanProjectQrToken(input) {
  const rawToken = typeof input.token === "string" ? input.token.trim() : "";
  if (!rawToken) {
    throw new AppError(40001, "参数错误: token 不能为空", 200);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const qrToken = await findQrTokenByToken(conn, rawToken);
    if (!qrToken || qrToken.status !== 0) {
      throw new AppError(40001, "二维码无效或已失效", 200);
    }

    const project = await getProjectOrThrow(conn, qrToken.project_id);
    ensureProjectInProgress(project);

    if (Number(input.userId) === Number(project.responsible_id)) {
      throw new AppError(40001, "带队管理员由系统自动签到签退，无需扫码", 200);
    }

    const isCheckIn = qrToken.code_type === PROJECT_QR_CODE_TYPE.CHECK_IN;
    const isCheckOut = qrToken.code_type === PROJECT_QR_CODE_TYPE.CHECK_OUT;
    if (!isCheckIn && !isCheckOut) {
      throw new AppError(40001, "二维码类型非法", 200);
    }

    const participant = await findParticipantRecord(conn, project.project_id, input.userId);

    if ((isCheckIn && participant?.check_in_at) || (isCheckOut && participant?.check_out_at)) {
      await conn.commit();
      return {
        action: isCheckIn ? "already_checked_in" : "already_checked_out",
        projectId: project.project_id,
        participant,
      };
    }

    const now = new Date();
    if (isCheckOut && participant?.check_in_at) {
      validateCheckOutAfterCheckIn(participant.check_in_at, now);
    }

    const consumedRows = await consumeQrToken(conn, qrToken.id, input.userId);
    if (consumedRows === 0) {
      throw new AppError(40001, "二维码已被使用", 200);
    }

    if (isCheckIn) {
      if (Number(input.userId) !== Number(project.responsible_id)) {
        await ensureResponsibleAutoCheckInOnFirstVolunteerCheckIn(conn, project);
      }
      await upsertParticipantCheckIn(conn, {
        projectId: project.project_id,
        userId: input.userId,
        source: ATTENDANCE_SOURCE.QR,
        checkInAt: now,
      });
    }

    if (isCheckOut) {
      await upsertParticipantCheckOut(conn, {
        projectId: project.project_id,
        userId: input.userId,
        source: ATTENDANCE_SOURCE.QR,
        checkOutAt: now,
      });
    }

    let updatedParticipant = await findParticipantRecord(conn, project.project_id, input.userId);
    if (updatedParticipant?.check_in_at && updatedParticipant?.check_out_at) {
      await settleParticipantIfReady(conn, project, updatedParticipant, "auto-settlement");
      updatedParticipant = await findParticipantRecord(conn, project.project_id, input.userId);
    }

    await conn.commit();

    return {
      action: isCheckIn ? "checked_in" : "checked_out",
      projectId: project.project_id,
      participant: updatedParticipant,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 查询当前用户可发起申请的对象。
 * @param {{applicantUser:{user_id:number|string},type?:number|string}} input 查询参数。
 * @returns {Promise<{items:object[]}>} 可申请对象列表。
 */
export async function queryAppealableTargets(input) {
  const applicantUserId = parsePositiveInt(input.applicantUser?.user_id, "user_id");
  const type = parseOptionalPositiveInt(input.type, "type");
  if (type !== undefined && !Object.values(APPEAL_TARGET_TYPE).includes(type)) {
    throw new AppError(40001, "参数错误: type 仅支持 1, 2", 200);
  }

  const conn = await pool.getConnection();
  try {
    const projects = await queryAllParticipantProjectsByUserId(conn, applicantUserId);
    const items = [];

    for (const participant of projects) {
      const participantType = Number(participant.is_valid) === 0
        ? APPEAL_TARGET_TYPE.INVALID_RECORD
        : (Number(participant.is_valid) === 1 && participant.settlement_hours !== null
          ? APPEAL_TARGET_TYPE.CHANGE_SETTLEMENT
          : null);

      if (!participantType) {
        continue;
      }
      if (type !== undefined && participantType !== type) {
        continue;
      }

      const pendingAppeal = await findPendingAppealByParticipantId(conn, participant.id);
      items.push({
        type: participantType,
        participantId: participant.id,
        hasPendingAppeal: Boolean(pendingAppeal),
        project: {
          projectId: participant.project_id,
          name: participant.project_name,
          durationHours: participant.duration_hours,
          projectStatus: participant.project_status,
          responsibleId: participant.responsible_id,
        },
        participant: {
          isValid: participant.is_valid,
          settlementHours: participant.settlement_hours,
          checkInAt: participant.check_in_at,
          checkOutAt: participant.check_out_at,
          note: participant.note,
        },
      });
    }

    return { items };
  } finally {
    conn.release();
  }
}

/**
 * 查询当前用户发起的申请进度。
 * @param {{status?:number|string,page?:number|string,pageSize?:number|string,applicantUser:{user_id:number|string}}} input 查询参数。
 * @returns {Promise<{items:object[],total:number,page:number,pageSize:number}>} 分页结果。
 */
export async function queryMyAppealProgress(input) {
  const pageRaw = parseOptionalPositiveInt(input.page, "page");
  const pageSizeRaw = parseOptionalPositiveInt(input.pageSize, "pageSize");
  const page = pageRaw ?? 1;
  const pageSize = pageSizeRaw ?? 20;
  if (pageSize > 100) {
    throw new AppError(40001, "参数错误: pageSize 不能超过 100", 200);
  }

  const status = parseAppealStatusFilter(input.status);

  const conn = await pool.getConnection();
  try {
    const { items, total } = await queryAppealsByApplicant(conn, {
      applicantId: parsePositiveInt(input.applicantUser?.user_id, "user_id"),
      status,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return {
      items,
      total,
      page,
      pageSize,
    };
  } finally {
    conn.release();
  }
}

/**
 * 志愿者发起统一申请（申诉无效记录 / 变更时长）。
 * @param {{participantId:number|string,time:number|string,reason:string,applicantUser:{user_id:number|string}}} input 申请参数。
 * @returns {Promise<object>} 新增申请。
 */
export async function createAppealRequest(input) {
  const participantId = parsePositiveInt(input.participantId, "participantId");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) {
    throw new AppError(40001, "参数错误: reason 不能为空", 200);
  }

  const desiredHours = parseAppealHours(input.time, "time");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `
      SELECT id
      FROM volunteer_project_participants
      WHERE id = ?
      FOR UPDATE
      `,
      [participantId]
    );

    const participant = await findParticipantRecordById(conn, participantId);
    if (!participant) {
      throw new AppError(40401, "参与记录不存在", 200);
    }
    if (Number(participant.user_id) !== Number(input.applicantUser.user_id)) {
      throw new AppError(40301, "只能为自己的参与记录发起申请", 200);
    }

    const project = await getProjectOrThrow(conn, participant.project_id);

    const pendingInProject = await findPendingAppealByApplicantAndProject(conn, {
      applicantId: input.applicantUser.user_id,
      projectId: project.project_id,
    });
    if (pendingInProject) {
      throw new AppError(40001, "该项目已有审核中的申请，暂不能重复发起", 200);
    }

    const pending = await findPendingAppealByParticipantId(conn, participant.id);
    if (pending) {
      throw new AppError(40001, "该参与记录已有待审核申请", 200);
    }

    let type;
    if (Number(participant.is_valid) === 0) {
      type = APPEAL_TYPE.INVALID_RECORD;
    } else if (Number(participant.is_valid) === 1 && participant.settlement_hours !== null) {
      type = APPEAL_TYPE.CHANGE_SETTLEMENT;
    } else {
      throw new AppError(40001, "当前记录状态不允许发起申请", 200);
    }

    const reviewerId = Number(project.responsible_id);
    const reviewer = await findActiveAdminByUserId(conn, reviewerId);
    if (!reviewer) {
      throw new AppError(40001, "项目负责人不是有效的管理员或超级管理员", 200);
    }

    const appealId = await createAppeal(conn, {
      type,
      participant_id: participant.id,
      applicant_id: input.applicantUser.user_id,
      expected_reviewer_id: reviewer.user_id,
      time: desiredHours,
      reason,
    });

    const created = await findAppealById(conn, appealId);
    await conn.commit();
    return created;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 管理员查询申请列表。
 * 普通管理员仅能看到自己负责审核的申请；超级管理员可查看全部。
 * @param {{status?:number|string,participantId?:number|string,applicantId?:number|string,expectedReviewerId?:number|string,page?:number|string,pageSize?:number|string,currentUser:{user_id:number|string,role:number}}} input 查询参数。
 * @returns {Promise<{items:object[],total:number,page:number,pageSize:number}>} 分页结果。
 */
export async function queryAppealRequests(input) {
  if (![2, 3].includes(input.currentUser?.role)) {
    throw new AppError(40301, "权限不足，仅管理员可查询申请", 200);
  }

  const pageRaw = parseOptionalPositiveInt(input.page, "page");
  const pageSizeRaw = parseOptionalPositiveInt(input.pageSize, "pageSize");
  const page = pageRaw ?? 1;
  const pageSize = pageSizeRaw ?? 20;
  if (pageSize > 100) {
    throw new AppError(40001, "参数错误: pageSize 不能超过 100", 200);
  }

  const status = parseAppealStatusFilter(input.status);

  const filters = {
    status,
    participantId: parseOptionalPositiveInt(input.participantId, "participantId"),
    applicantId: parseOptionalPositiveInt(input.applicantId, "applicantId"),
    expectedReviewerId: parseOptionalPositiveInt(input.expectedReviewerId, "expectedReviewerId"),
    reviewerUserId: input.currentUser.role === 3 ? undefined : Number(input.currentUser.user_id),
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };

  const conn = await pool.getConnection();
  try {
    const { items, total } = await queryAppeals(conn, filters);
    return {
      items,
      total,
      page,
      pageSize,
    };
  } finally {
    conn.release();
  }
}

function ensureAppealReviewerPermission(currentUser, appeal) {
  if (currentUser.role === 3) {
    return;
  }

  if (
    currentUser.role !== 2 ||
    Number(currentUser.user_id) !== Number(appeal.expected_reviewer_id)
  ) {
    throw new AppError(40301, "权限不足，非该申请审核员", 200);
  }
}

/**
 * 审核通过申请。
 * @param {{appealId:number|string,reviewComment?:string,currentUser:{user_id:number|string,role:number}}} input 审核参数。
 * @returns {Promise<{appeal:object,participant:object}>} 审核结果。
 */
export async function approveAppealRequest(input) {
  const appealId = parsePositiveInt(input.appealId, "appealId");
  const reviewComment = typeof input.reviewComment === "string" ? input.reviewComment.trim() : "";
  if (!reviewComment) {
    throw new AppError(40001, "参数错误: reviewComment 不能为空", 200);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const appeal = await findAppealById(conn, appealId);
    if (!appeal) {
      throw new AppError(40401, "申请不存在", 200);
    }
    if (appeal.status !== APPEAL_STATUS.PENDING) {
      throw new AppError(40001, "申请已处理，请勿重复审核", 200);
    }

    ensureAppealReviewerPermission(input.currentUser, appeal);

    const participant = await findParticipantRecordById(conn, appeal.participant_id);
    if (!participant) {
      throw new AppError(40401, "参与记录不存在", 200);
    }

    await getProjectOrThrow(conn, participant.project_id);
    const approvedHours = parseAppealHours(appeal.time, "time");

    const affectedRows = await reviewAppealById(conn, {
      appealId: appeal.id,
      nextStatus: APPEAL_STATUS.APPROVED,
      reviewerId: input.currentUser.user_id,
      reviewComment,
    });
    if (affectedRows === 0) {
      throw new AppError(40001, "申请状态已变化，请刷新后重试", 200);
    }

    const wasCounted = Number(participant.is_valid) === 1 && participant.settlement_hours !== null;
    const oldHours = wasCounted ? Number(participant.settlement_hours) : 0;

    await updateParticipantSettlementById(conn, {
      participantId: participant.id,
      isValid: 1,
      settlementHours: approvedHours,
      note: `申请通过: ${reviewComment}`,
    });

    if (wasCounted) {
      const deltaHours = Number((approvedHours - oldHours).toFixed(1));
      if (deltaHours !== 0) {
        await adjustVolunteerHoursByDelta(conn, participant.user_id, deltaHours);
      }
    } else {
      await incrementVolunteerSummaryByUserId(conn, participant.user_id, approvedHours);
    }

    const updatedAppeal = await findAppealById(conn, appeal.id);
    const updatedParticipant = await findParticipantRecordById(conn, participant.id);

    await conn.commit();
    return {
      appeal: updatedAppeal,
      participant: updatedParticipant,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 审核拒绝申请。
 * @param {{appealId:number|string,reviewComment:string,currentUser:{user_id:number|string,role:number}}} input 审核参数。
 * @returns {Promise<object>} 审核后的申请。
 */
export async function rejectAppealRequest(input) {
  const appealId = parsePositiveInt(input.appealId, "appealId");
  const reviewComment = typeof input.reviewComment === "string" ? input.reviewComment.trim() : "";
  if (!reviewComment) {
    throw new AppError(40001, "参数错误: reviewComment 不能为空", 200);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const appeal = await findAppealById(conn, appealId);
    if (!appeal) {
      throw new AppError(40401, "申请不存在", 200);
    }
    if (appeal.status !== APPEAL_STATUS.PENDING) {
      throw new AppError(40001, "申请已处理，请勿重复审核", 200);
    }

    ensureAppealReviewerPermission(input.currentUser, appeal);

    const affectedRows = await reviewAppealById(conn, {
      appealId: appeal.id,
      nextStatus: APPEAL_STATUS.REJECTED,
      reviewerId: input.currentUser.user_id,
      reviewComment,
    });
    if (affectedRows === 0) {
      throw new AppError(40001, "申请状态已变化，请刷新后重试", 200);
    }

    const updatedAppeal = await findAppealById(conn, appeal.id);
    await conn.commit();
    return updatedAppeal;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
