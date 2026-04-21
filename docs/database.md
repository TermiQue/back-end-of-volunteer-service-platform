-- ======================================================
-- 1. 用户基础表
-- ======================================================
CREATE TABLE `users` (
                         `user_id` int NOT NULL AUTO_INCREMENT,
                         `openid` varchar(100) NOT NULL,
                         `unionid` varchar(100) DEFAULT '',
                         `nickname` varchar(100) DEFAULT '',
                         `avatar_url` varchar(255) DEFAULT '',
                         `role` tinyint NOT NULL DEFAULT 0 COMMENT '0:志愿者, 1:临界少年, 2:管理员, 3:超级管理员',
                         `status` tinyint NOT NULL DEFAULT 1 COMMENT '1:正常, 0:禁用',
                         `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
                         `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                         PRIMARY KEY (`user_id`),
                         UNIQUE KEY `uk_openid` (`openid`),
                         KEY `idx_role_status` (`role`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ======================================================
-- 2. 用户登录会话表
-- ======================================================
CREATE TABLE `user_login_session` (
                                      `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
                                      `user_id` int NOT NULL COMMENT '业务系统用户ID',
                                      `session_key` varchar(64) DEFAULT NULL COMMENT '微信小程序session_key',
                                      `access_token` varchar(512) NOT NULL COMMENT '短token',
                                      `refresh_token` varchar(512) NOT NULL COMMENT '长token',
                                      `access_expire_at` datetime NOT NULL COMMENT '短token过期时间',
                                      `refresh_expire_at` datetime NOT NULL COMMENT '长token过期时间',
                                      `device_type` tinyint DEFAULT NULL COMMENT '设备类型 1-小程序 2-APP 3-H5 4-PC',
                                      `device_id` varchar(100) DEFAULT NULL COMMENT '设备唯一标识',
                                      `login_ip` varchar(32) DEFAULT NULL COMMENT '登录IP',
                                      `login_status` tinyint NOT NULL DEFAULT 1 COMMENT '状态 1-有效 0-失效 2-主动登出',
                                      `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                                      `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                                      PRIMARY KEY (`id`),
                                      UNIQUE KEY `uk_refresh_token` (`refresh_token`),
                                      UNIQUE KEY `uk_access_token` (`access_token`),
                                      KEY `idx_user_id` (`user_id`),
                                      KEY `idx_access_expire` (`access_expire_at`),
                                      KEY `idx_refresh_expire` (`refresh_expire_at`),
                                      KEY `idx_login_status_expire` (`login_status`, `access_expire_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ======================================================
-- 3. 志愿者与管理员基本信息表
-- ======================================================
CREATE TABLE `volunteers` (
                              `user_id` int NOT NULL,
                              `name` varchar(50) NOT NULL,
                              `student_id` varchar(50) NOT NULL,
                              `phone` varchar(30) DEFAULT NULL,
                              `volunteer_hours` decimal(10,1) NOT NULL DEFAULT 0 COMMENT '志愿时长（小时）',
                              `project_count` int NOT NULL DEFAULT 0 COMMENT '志愿项目数',
                              `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
                              `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                              PRIMARY KEY (`user_id`),
                              UNIQUE KEY `uk_student_id` (`student_id`),
                              CONSTRAINT `fk_volunteer_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ======================================================
-- 4. 临界青年基本信息表（占位）
-- ======================================================

-- ======================================================
-- 5. 志愿项目表
-- ======================================================
CREATE TABLE `volunteer_projects` (
                                      `project_id` int NOT NULL AUTO_INCREMENT,
                                      `name` varchar(200) NOT NULL,
                                      `description` text,
                                      `start_time` datetime NOT NULL,
                                      `end_time` datetime NOT NULL,
                                      `duration_hours` decimal(10,1) NOT NULL COMMENT '计划志愿时长（小时）',
                                      `status` tinyint NOT NULL DEFAULT 0 COMMENT '0:未开启, 1:进行中, 2:已结束',
                                      `created_by_id` int NOT NULL COMMENT '管理员user_id',
                                      `responsible_id` int NOT NULL COMMENT '负责人user_id',
                                      `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
                                      `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                      PRIMARY KEY (`project_id`),
                                      KEY `idx_status_start_time` (`status`, `start_time`),
                                      CONSTRAINT `fk_project_created_by` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
                                      CONSTRAINT `fk_project_responsible` FOREIGN KEY (`responsible_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
                                      CHECK (`end_time` > `start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ======================================================
-- 6. 志愿项目二维码令牌表
-- ======================================================
CREATE TABLE `volunteer_project_qr_tokens` (
                                               `id` bigint NOT NULL AUTO_INCREMENT,
                                               `project_id` int NOT NULL,
                                               `code_type` tinyint NOT NULL COMMENT '1:签到码, 2:签退码',
                                               `token` varchar(64) NOT NULL,
                                               `status` tinyint NOT NULL DEFAULT 0 COMMENT '0:未使用, 1:已使用',
                                               `used_by` int DEFAULT NULL COMMENT '扫码用户user_id',
                                               `used_at` datetime DEFAULT NULL,
                                               `created_by` int NOT NULL COMMENT '生成者（管理员）user_id',
                                               `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
                                               PRIMARY KEY (`id`),
                                               UNIQUE KEY `uk_token` (`token`),
                                               KEY `idx_project_type_status` (`project_id`, `code_type`, `status`),
                                               CONSTRAINT `fk_qr_project` FOREIGN KEY (`project_id`) REFERENCES `volunteer_projects` (`project_id`) ON DELETE RESTRICT,
                                               CONSTRAINT `fk_qr_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
                                               CONSTRAINT `fk_qr_used_by` FOREIGN KEY (`used_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ======================================================
-- 7. 志愿项目参与记录表
-- ======================================================
CREATE TABLE `volunteer_project_participants` (
                                                  `id` bigint NOT NULL AUTO_INCREMENT,
                                                  `project_id` int NOT NULL,
                                                  `user_id` int NOT NULL,
                                                  `check_in_at` datetime DEFAULT NULL COMMENT '签到时间',
                                                  `check_out_at` datetime DEFAULT NULL COMMENT '签退时间',
                                                  `check_in_source` varchar(20) DEFAULT NULL COMMENT 'qr/admin_auto',
                                                  `check_out_source` varchar(20) DEFAULT NULL COMMENT 'qr/admin_auto',
                                                  `is_valid` tinyint NOT NULL DEFAULT 1 COMMENT '记录是否有效 1-有效 0-无效（驳回/申诉覆盖）',
                                                  `settlement_hours` decimal(10,1) DEFAULT NULL COMMENT '结算时长',
                                                  `note` text DEFAULT NULL COMMENT '备注（如申诉通过理由）',
                                                  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
                                                  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                                  PRIMARY KEY (`id`),
                                                  UNIQUE KEY `uk_project_user` (`project_id`, `user_id`),
                                                  KEY `idx_project` (`project_id`),
                                                  KEY `idx_user_valid` (`user_id`, `is_valid`),
                                                  CONSTRAINT `fk_participant_project` FOREIGN KEY (`project_id`) REFERENCES `volunteer_projects` (`project_id`) ON DELETE RESTRICT,
                                                  CONSTRAINT `fk_participant_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
                                                  CHECK (`check_out_at` IS NULL OR `check_out_at` > `check_in_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ======================================================
-- 8. 申请表
-- ======================================================
CREATE TABLE `appeal` (
                          `id` int NOT NULL AUTO_INCREMENT,
                          `type` tinyint NOT NULL COMMENT '1-申诉，2-更改时长',
                          `participant_id` bigint NOT NULL COMMENT '参与记录id',
                          `applicant_id` int NOT NULL COMMENT '申请者user_id',
                          `expected_reviewer_id` int DEFAULT NULL COMMENT '期望审核员user_id',
                          `time` decimal(10,1) NOT NULL COMMENT '申请的时长',
                          `reason` text NOT NULL COMMENT '申诉理由',
                          `apply_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
                          `status` tinyint NOT NULL DEFAULT 0 COMMENT '0-待审核, 1-已通过, 2-已拒绝',
                          `reviewer_id` int DEFAULT NULL COMMENT '实际审核员user_id',
                          `review_time` datetime DEFAULT NULL COMMENT '审核时间',
                          `review_comment` text DEFAULT NULL COMMENT '审核意见',
                          PRIMARY KEY (`id`),
                          KEY `idx_applicant` (`applicant_id`),
                          KEY `idx_expected_reviewer` (`expected_reviewer_id`),
                          KEY `idx_status` (`status`),
                          CONSTRAINT `fk_appeal_participant` FOREIGN KEY (`participant_id`) REFERENCES `volunteer_project_participants` (`id`) ON DELETE RESTRICT,
                          CONSTRAINT `fk_appeal_applicant` FOREIGN KEY (`applicant_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
                          CONSTRAINT `fk_appeal_expected_reviewer` FOREIGN KEY (`expected_reviewer_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
                          CONSTRAINT `fk_appeal_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
                          CHECK (`status` IN (0,1,2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;