// 导入 Express 框架，导入路由模块
import express from 'express';
import authRoutes from './api/authRoutes.js';
import contentRoutes from './api/contentRoutes.js';
import adminRoutes from './api/adminRoutes.js';
import { healthz } from '../controllers/healthController.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// 创建 Express 路由实例
const router = express.Router();

// 挂载认证和内容相关的路由，统一前缀 /api
router.use('/api', authRoutes);
router.use('/api', contentRoutes);
router.use('/api', adminRoutes);

// 健康检查接口
router.get('/healthz', asyncHandler(healthz));

// 导出路由模块
export default router;