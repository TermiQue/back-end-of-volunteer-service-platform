import { AppError } from "../utils/errors.js";
import { ok } from "../utils/response.js";
import {
  queryAppealableTargets,
  queryMyAppealProgress,
  createAppealRequest,
  createVolunteerProjectDraft,
  endVolunteerProject,
  getProjectQrToken,
  exportProjectParticipantsExcel,
  getVolunteerDetailForAdmin,
  PROJECT_QR_CODE_TYPE,
  queryAdminProfilesForSuperAdmin,
  queryAppealRequests,
  scanProjectQrToken,
  searchVolunteerProjects,
  searchVolunteersForAdmin,
  startVolunteerProject,
  updateProjectResponsible,
  approveAppealRequest,
  rejectAppealRequest,
} from "../services/volunteerProjectService.js";

function parseProjectIdOrThrow(rawId) {
  const projectId = Number(rawId);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new AppError(40001, "参数错误: projectId 必须是正整数", 200);
  }
  return projectId;
}

function parseUserIdOrThrow(rawId) {
  const userId = Number(rawId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new AppError(40001, "参数错误: userId 必须是正整数", 200);
  }
  return userId;
}

function parseAppealIdOrThrow(rawId) {
  const appealId = Number(rawId);
  if (!Number.isInteger(appealId) || appealId <= 0) {
    throw new AppError(40001, "参数错误: appealId 必须是正整数", 200);
  }
  return appealId;
}

/**
 * 超级管理员创建志愿项目草稿。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 创建结果。
 */
export async function createProjectDraft(req, res) {
  const body = req.body || {};
  const project = await createVolunteerProjectDraft({
    name: body.name,
    description: body.description,
    startTime: body.startTime,
    endTime: body.endTime,
    durationHours: body.durationHours,
    createdBy: req.currentUser.user_id,
    currentUserRole: req.currentUser.role,
    responsibleId: body.responsibleId,
  });

  return res.status(200).json(ok({ project }, "创建草稿成功"));
}

/**
 * 超级管理员修改项目负责人。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 更新结果。
 */
export async function updateProjectResponsibleAction(req, res) {
  const body = req.body || {};
  const projectId = parseProjectIdOrThrow(req.params.projectId);
  const project = await updateProjectResponsible({
    projectId,
    responsibleId: body.responsibleId,
    operatorUser: req.currentUser,
  });

  return res.status(200).json(ok({ project }, "负责人更新成功"));
}

/**
 * 管理员多条件查询项目。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 查询结果。
 */
export async function queryProjects(req, res) {
  const query = req.query || {};
  const result = await searchVolunteerProjects({
    projectId: query.projectId,
    name: query.name,
    startTimeFrom: query.startTimeFrom,
    startTimeTo: query.startTimeTo,
    endTimeFrom: query.endTimeFrom,
    endTimeTo: query.endTimeTo,
    durationHoursMin: query.durationHoursMin,
    durationHoursMax: query.durationHoursMax,
    status: query.status,
    createdById: query.createdById,
    responsibleId: query.responsibleId,
    createdTimeFrom: query.createdTimeFrom,
    createdTimeTo: query.createdTimeTo,
    page: query.page,
    pageSize: query.pageSize,
  });

  return res.status(200).json(ok(result, "查询成功"));
}

/**
 * 管理员手动开启志愿项目（仅 0->1）。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 开启结果。
 */
export async function startProject(req, res) {
  const projectId = parseProjectIdOrThrow(req.params.projectId);
  const project = await startVolunteerProject(projectId, req.currentUser);
  return res.status(200).json(ok({ project }, "项目开启成功"));
}

/**
 * 管理员手动结束志愿项目（仅 1->2）。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 结束结果。
 */
export async function endProject(req, res) {
  const projectId = parseProjectIdOrThrow(req.params.projectId);
  const project = await endVolunteerProject(projectId, req.currentUser);
  return res.status(200).json(ok({ project }, "项目结束成功"));
}

/**
 * 管理员多条件查询志愿者。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 查询结果。
 */
export async function queryVolunteers(req, res) {
  const query = req.query || {};
  const result = await searchVolunteersForAdmin({
    name: query.name,
    studentId: query.studentId,
    volunteerHoursMin: query.volunteerHoursMin,
    volunteerHoursMax: query.volunteerHoursMax,
    projectCountMin: query.projectCountMin,
    projectCountMax: query.projectCountMax,
    page: query.page,
    pageSize: query.pageSize,
  });

  return res.status(200).json(ok(result, "查询成功"));
}

/**
 * 管理员查看单个志愿者详情及其全部参与项目。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 查询结果。
 */
export async function getVolunteerDetail(req, res) {
  const userId = parseUserIdOrThrow(req.params.userId);
  const result = await getVolunteerDetailForAdmin(userId);
  return res.status(200).json(ok(result, "查询成功"));
}

/**
 * 导出项目参与信息 Excel。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<void>} 直接返回文件流。
 */
export async function exportProjectParticipantsExcelAction(req, res) {
  const projectId = parseProjectIdOrThrow(req.params.projectId);
  const { fileName, buffer } = await exportProjectParticipantsExcel({
    projectId,
    operatorUser: req.currentUser,
  });

  const encodedFileName = encodeURIComponent(fileName);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.status(200).send(buffer);
}

/**
 * 超级管理员查询全部管理员档案。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 查询结果。
 */
export async function queryAdmins(req, res) {
  const admins = await queryAdminProfilesForSuperAdmin(req.currentUser);
  return res.status(200).json(ok({ items: admins }, "查询成功"));
}

/**
 * 管理员获取签到二维码 token。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 获取结果。
 */
export async function getProjectCheckinQr(req, res) {
  const projectId = parseProjectIdOrThrow(req.params.projectId);
  const qr = await getProjectQrToken({
    projectId,
    operatorUser: req.currentUser,
    codeType: PROJECT_QR_CODE_TYPE.CHECK_IN,
  });
  return res.status(200).json(ok({ qr }, "获取签到码成功"));
}

/**
 * 管理员获取签退二维码 token。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 获取结果。
 */
export async function getProjectCheckoutQr(req, res) {
  const projectId = parseProjectIdOrThrow(req.params.projectId);
  const qr = await getProjectQrToken({
    projectId,
    operatorUser: req.currentUser,
    codeType: PROJECT_QR_CODE_TYPE.CHECK_OUT,
  });
  return res.status(200).json(ok({ qr }, "获取签退码成功"));
}

/**
 * 已登录用户扫码签到/签退。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 扫码结果。
 */
export async function scanProjectQr(req, res) {
  const body = req.body || {};
  const result = await scanProjectQrToken({
    token: body.token,
    userId: req.currentUser.user_id,
  });
  const message = result.action === "checked_in" || result.action === "already_checked_in"
    ? "扫码签到成功"
    : "扫码签退成功";
  return res.status(200).json(ok(result, message));
}

/**
 * 志愿者发起统一申请。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 创建结果。
 */
export async function createAppealAction(req, res) {
  const body = req.body || {};
  const appeal = await createAppealRequest({
    participantId: body.participantId,
    time: body.time,
    reason: body.reason,
    applicantUser: req.currentUser,
  });
  return res.status(200).json(ok({ appeal }, "申请提交成功"));
}

/**
 * 志愿者查询可申请对象。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 查询结果。
 */
export async function queryAppealableTargetsAction(req, res) {
  const query = req.query || {};
  const result = await queryAppealableTargets({
    type: query.type,
    applicantUser: req.currentUser,
  });
  return res.status(200).json(ok(result, "查询成功"));
}

/**
 * 志愿者查询自己发起的申请进度。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 查询结果。
 */
export async function queryMyAppealsAction(req, res) {
  const query = req.query || {};
  const result = await queryMyAppealProgress({
    status: query.status,
    page: query.page,
    pageSize: query.pageSize,
    applicantUser: req.currentUser,
  });
  return res.status(200).json(ok(result, "查询成功"));
}

/**
 * 管理员查询申请。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 查询结果。
 */
export async function queryAppealsAction(req, res) {
  const query = req.query || {};
  const result = await queryAppealRequests({
    status: query.status,
    participantId: query.participantId,
    applicantId: query.applicantId,
    expectedReviewerId: query.expectedReviewerId,
    page: query.page,
    pageSize: query.pageSize,
    currentUser: req.currentUser,
  });
  return res.status(200).json(ok(result, "查询成功"));
}

/**
 * 管理员审核通过申请。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 审核结果。
 */
export async function approveAppealAction(req, res) {
  const appealId = parseAppealIdOrThrow(req.params.appealId);
  const body = req.body || {};
  const result = await approveAppealRequest({
    appealId,
    reviewComment: body.reviewComment,
    currentUser: req.currentUser,
  });
  return res.status(200).json(ok(result, "审核通过"));
}

/**
 * 管理员审核拒绝申请。
 * @param {import("express").Request} req 请求对象。
 * @param {import("express").Response} res 响应对象。
 * @returns {Promise<import("express").Response>} 审核结果。
 */
export async function rejectAppealAction(req, res) {
  const appealId = parseAppealIdOrThrow(req.params.appealId);
  const body = req.body || {};
  const appeal = await rejectAppealRequest({
    appealId,
    reviewComment: body.reviewComment,
    currentUser: req.currentUser,
  });
  return res.status(200).json(ok({ appeal }, "审核拒绝"));
}
