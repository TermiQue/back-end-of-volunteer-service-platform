import { ok } from "../utils/response.js";
import {
  markMyNotificationRead,
  queryMyNotifications,
  softDeleteMyNotification,
} from "../services/notificationService.js";

export async function queryMyNotificationsAction(req, res) {
  const query = req.query || {};
  const result = await queryMyNotifications({
    page: query.page,
    pageSize: query.pageSize,
    currentUser: req.currentUser,
  });
  return res.status(200).json(ok(result, "查询成功"));
}

export async function markMyNotificationReadAction(req, res) {
  const result = await markMyNotificationRead({
    notificationId: req.params.notificationId,
    currentUser: req.currentUser,
  });
  return res.status(200).json(ok(result, "已标记为已读"));
}

export async function softDeleteMyNotificationAction(req, res) {
  await softDeleteMyNotification({
    notificationId: req.params.notificationId,
    currentUser: req.currentUser,
  });
  return res.status(200).json(ok(null, "删除成功"));
}
