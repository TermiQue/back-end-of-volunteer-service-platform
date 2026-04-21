// -- 1. 用户基础表
// CREATE TABLE `users` (
//                          `user_id` int NOT NULL AUTO_INCREMENT,
//                          `openid` varchar(100) NOT NULL,
//                          `unionid` varchar(100) DEFAULT '' COMMENT '微信unionid，跨应用唯一标识',
//                          `nickname` varchar(100) DEFAULT '',
//                          `avatar_url` varchar(255) DEFAULT '',
//                          `role` tinyint NOT NULL DEFAULT 0 COMMENT '0:志愿者, 1:临界少年, 2:管理员, 3.禁用',
//                          `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
//                          `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//                          PRIMARY KEY (`user_id`),
//                          UNIQUE KEY `uk_openid` (`openid`)
// ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/**
 * 根据用户 ID 查询用户基础信息。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} userId 用户 ID。
 * @returns {Promise<{user_id:number,nickname:string,avatar_url:string,role:number,status:number}|null>} 用户信息，不存在时返回 null。
 */
export async function findUserById(conn, userId) {
  const [rows] = await conn.execute(
    `
    SELECT user_id, nickname, avatar_url, role, status
    FROM users 
    WHERE user_id = ? 
    LIMIT 1
    `,
    [userId]
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 根据微信 openid 查询用户基础信息。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {string} openid 微信 openid。
 * @returns {Promise<{user_id:number,nickname:string,avatar_url:string,role:number,status:number}|null>} 用户信息，不存在时返回 null。
 */
export async function findUserByWechatOpenid(conn, openid) {
  const [rows] = await conn.execute(
    `
    SELECT user_id, nickname, avatar_url, role, status
    FROM users 
    WHERE openid = ? 
    LIMIT 1
    `,
    [openid]
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 创建用户并返回新用户 ID。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{openid:string,unionid:string,nickname:string,avatar_url:string,role:number}} data 用户创建参数。
 * @returns {Promise<number>} 新创建用户的自增 ID。
 */
export async function createUser(conn, { openid, unionid, nickname, avatar_url, role }) {
  const [result] = await conn.execute(
    `
    INSERT INTO users (openid, unionid, nickname, avatar_url, role, status)
    VALUES (?, ?, ?, ?, ?, 1)
    `,
    [openid, unionid, nickname, avatar_url, role]
  );
  return result.insertId;
}

/**
 * 查询可用的管理员/超级管理员用户。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} userId 用户 ID。
 * @returns {Promise<{user_id:number,role:number,status:number}|null>} 用户信息。
 */
export async function findActiveAdminByUserId(conn, userId) {
  const [rows] = await conn.execute(
    `
    SELECT user_id, role, status
    FROM users
    WHERE user_id = ?
      AND status = 1
      AND role IN (2, 3)
    LIMIT 1
    `,
    [userId]
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 超级管理员查询全部管理员（含超级管理员）基础档案。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @returns {Promise<Array<{user_id:number,name:string|null,student_id:string|null,role:number,status:number}>>} 管理员列表。
 */
export async function queryAllAdminProfiles(conn) {
  const [rows] = await conn.execute(
    `
    SELECT
      u.user_id,
      v.name,
      v.student_id,
      u.role,
      u.status
    FROM users u
    LEFT JOIN volunteers v ON v.user_id = u.user_id
    WHERE u.role IN (2, 3)
    ORDER BY u.role DESC, u.user_id ASC
    `
  );

  return Array.isArray(rows) ? rows : [];
}


/**
 * 根据用户 ID 更新昵称。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} userId 用户 ID。
 * @param {string} nickname 新昵称。
 * @returns {Promise<void>} 无返回值。
 */
export async function updateUserNickname(conn, userId, nickname) {
  await conn.execute(
    `
    UPDATE users SET 
    nickname = ? 
    WHERE user_id = ?
    `, 
    [nickname, userId]
  );
}

/**
 * 根据用户 ID 更新基础资料字段。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} userId 用户 ID。
 * @param {{nickname:string,avatar_url:string}} data 可更新的用户资料。
 * @returns {Promise<void>} 无返回值。
 */
export async function updateUserById(conn, userId, { nickname, avatar_url }) {
  await conn.execute(
    `
    UPDATE users SET
    nickname = ?,
    avatar_url = ?
    WHERE user_id = ?
    `,
    [nickname, avatar_url, userId]
  );
}
