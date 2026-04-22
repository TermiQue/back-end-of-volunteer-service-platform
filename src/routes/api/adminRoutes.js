import express from "express";
import { requireAuth, requireAdmin, requireSuperAdmin } from "../../utils/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createProjectDraft,
  queryProjects,
  startProject,
  endProject,
  updateProjectResponsibleAction,
  getProjectCheckinQr,
  getProjectCheckoutQr,
  exportProjectParticipantsExcelAction,
  queryVolunteers,
  getVolunteerDetail,
  queryAdmins,
  promoteVolunteerToAdminAction,
  demoteAdminToVolunteerAction,
  queryAppealsAction,
  approveAppealAction,
  rejectAppealAction,
} from "../../controllers/volunteerProjectController.js";

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/admin/projects", asyncHandler(queryProjects));
router.get("/admin/volunteers", asyncHandler(queryVolunteers));
router.get("/admin/volunteers/:userId", asyncHandler(getVolunteerDetail));
router.get("/admin/admins", requireSuperAdmin, asyncHandler(queryAdmins));
router.post("/admin/admins/:userId/promote", requireSuperAdmin, asyncHandler(promoteVolunteerToAdminAction));
router.post("/admin/admins/:userId/demote", requireSuperAdmin, asyncHandler(demoteAdminToVolunteerAction));
router.get("/admin/appeals", asyncHandler(queryAppealsAction));
router.post("/admin/projects", requireSuperAdmin, asyncHandler(createProjectDraft));
router.post("/admin/projects/:projectId/responsible", requireSuperAdmin, asyncHandler(updateProjectResponsibleAction));
router.post("/admin/projects/:projectId/start", asyncHandler(startProject));
router.post("/admin/projects/:projectId/end", asyncHandler(endProject));
router.post("/admin/appeals/:appealId/approve", asyncHandler(approveAppealAction));
router.post("/admin/appeals/:appealId/reject", asyncHandler(rejectAppealAction));
router.get("/admin/projects/:projectId/qr/checkin", asyncHandler(getProjectCheckinQr));
router.get("/admin/projects/:projectId/qr/checkout", asyncHandler(getProjectCheckoutQr));
router.get("/admin/projects/:projectId/participants/export", asyncHandler(exportProjectParticipantsExcelAction));

export default router;
