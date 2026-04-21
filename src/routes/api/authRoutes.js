import express from 'express';
import {
	loginWechat,
	authMe,
	refreshToken,
	authLogout,
	getMyNickname,
	updateMyNickname,
	getMyAvatar,
	updateMyAvatar,
	profile,
	refreshProfileSummary,
	myProjects,
} from '../../controllers/authController.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../utils/auth.js';
import { avatarUpload } from '../../utils/upload.js';

const router = express.Router();

router.post('/login/wechat', asyncHandler(loginWechat));
router.get('/auth/me', requireAuth, asyncHandler(authMe));
router.post('/auth/refresh-token', asyncHandler(refreshToken));
router.post('/auth/logout', requireAuth, asyncHandler(authLogout));
router.get('/auth/nickname', requireAuth, asyncHandler(getMyNickname));
router.post('/auth/nickname', requireAuth, asyncHandler(updateMyNickname));
router.get('/auth/avatar', requireAuth, asyncHandler(getMyAvatar));
router.post('/auth/avatar', requireAuth, avatarUpload.single('avatar'), asyncHandler(updateMyAvatar));
router.post('/auth/profile', requireAuth, asyncHandler(profile));
router.post('/auth/profile/refresh', requireAuth, asyncHandler(refreshProfileSummary));
router.get('/auth/projects', requireAuth, asyncHandler(myProjects));


export default router;