/**
 * 二维码令牌表（建议与 docs/database.md 保持一致）：
 * CREATE TABLE `volunteer_project_qr_tokens` (
 *   `id` bigint NOT NULL AUTO_INCREMENT,
 *   `project_id` int NOT NULL,
 *   `code_type` tinyint NOT NULL COMMENT '1:签到码, 2:签退码',
 *   `token` varchar(64) NOT NULL,
 *   `status` tinyint NOT NULL DEFAULT 0 COMMENT '0:未使用, 1:已使用',
 *   `used_by` int DEFAULT NULL,
 *   `used_at` datetime DEFAULT NULL,
 *   `created_by` int NOT NULL,
 *   `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 *   PRIMARY KEY (`id`),
 *   UNIQUE KEY `uk_token` (`token`),
 *   KEY `idx_project_type_status` (`project_id`, `code_type`, `status`)
 * ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
 */

/**
 * 查询项目当前可用二维码令牌（未使用）。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} projectId 项目 ID。
 * @param {number} codeType 1:签到码, 2:签退码。
 * @returns {Promise<object|null>} 令牌记录。
 */
export async function findLatestActiveQrToken(conn, projectId, codeType) {
  const [rows] = await conn.execute(
    `
    SELECT id, project_id, code_type, token, status, created_by, created_at
    FROM volunteer_project_qr_tokens
    WHERE project_id = ? AND code_type = ? AND status = 0
    ORDER BY id DESC
    LIMIT 1
    `,
    [projectId, codeType]
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 创建二维码令牌。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{project_id:number|string,code_type:number,token:string,created_by:number|string}} data 创建参数。
 * @returns {Promise<number>} 新记录 ID。
 */
export async function createQrToken(conn, data) {
  const [result] = await conn.execute(
    `
    INSERT INTO volunteer_project_qr_tokens (project_id, code_type, token, created_by)
    VALUES (?, ?, ?, ?)
    `,
    [data.project_id, data.code_type, data.token, data.created_by]
  );
  return result.insertId;
}

/**
 * 根据 token 查询二维码记录。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {string} token 二维码 token。
 * @returns {Promise<object|null>} 令牌记录。
 */
export async function findQrTokenByToken(conn, token) {
  const [rows] = await conn.execute(
    `
    SELECT id, project_id, code_type, token, status, used_by, used_at, created_by, created_at
    FROM volunteer_project_qr_tokens
    WHERE token = ?
    LIMIT 1
    `,
    [token]
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 原子消费二维码：仅未使用状态可更新为已使用。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} tokenId 令牌 ID。
 * @param {number|string} usedBy 扫码用户 ID。
 * @returns {Promise<number>} 受影响行数。
 */
export async function consumeQrToken(conn, tokenId, usedBy) {
  const [result] = await conn.execute(
    `
    UPDATE volunteer_project_qr_tokens
    SET status = 1, used_by = ?, used_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 0
    `,
    [usedBy, tokenId]
  );
  return result.affectedRows || 0;
}
