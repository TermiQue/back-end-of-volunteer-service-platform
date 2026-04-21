import express from 'express';
import { requireAuth } from '../../utils/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
	createAppealAction,
	queryAppealableTargetsAction,
	queryMyAppealsAction,
	scanProjectQr,
} from '../../controllers/volunteerProjectController.js';
import { getPublicContentFile } from '../../controllers/contentController.js';

const router = express.Router();

router.get('/content/public-file', asyncHandler(getPublicContentFile));
router.post('/projects/scan', requireAuth, asyncHandler(scanProjectQr));
router.get('/appeals/targets', requireAuth, asyncHandler(queryAppealableTargetsAction));
router.get('/appeals/my', requireAuth, asyncHandler(queryMyAppealsAction));
router.post('/appeals', requireAuth, asyncHandler(createAppealAction));

export default router;
