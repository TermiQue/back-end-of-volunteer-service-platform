// user_login_session 表结构说明见 docs/database.md。

/**
 * 根据用户 ID 查询登录会话（单条）。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} userId 用户 ID。
 * @returns {Promise<Object|null>} 会话记录，不存在时返回 null。
 */
export async function findLoginSessionByUserId(conn, userId) {
  const [rows] = await conn.execute(
    `
    SELECT id, user_id, session_key, access_token, refresh_token, access_expire_at, refresh_expire_at, device_type, device_id, login_ip, login_status
    FROM user_login_session
    WHERE user_id = ?
    LIMIT 1
    `,
    [userId]
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 根据用户 ID 与设备 ID 查询登录会话。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} userId 用户 ID。
 * @param {string} deviceId 设备 ID。
 * @returns {Promise<Object|null>} 会话记录，不存在时返回 null。
 */
export async function findLoginSessionByUserIdAndDeviceId(conn, userId, deviceId) {
  const [rows] = await conn.execute(
    `
    SELECT id, user_id, session_key, access_token, refresh_token, access_expire_at, refresh_expire_at, device_type, device_id, login_ip, login_status
    FROM user_login_session
    WHERE user_id = ? AND device_id = ?
    LIMIT 1
    `,
    [userId, deviceId]
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 按用户 ID 更新登录会话。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {Object} data 会话更新参数。
 * @returns {Promise<void>} 无返回值。
 */
export async function updateLoginSessionByUserId(conn, data) {
  await conn.execute(
    `
    UPDATE user_login_session
    SET session_key = ?, access_token = ?, refresh_token = ?,
        access_expire_at = ?, refresh_expire_at = ?, device_type = ?, device_id = ?,
        login_ip = ?, login_status = ?
    WHERE user_id = ?
    `,
    [
      data.session_key,
      data.access_token,
      data.refresh_token,
      data.access_expire_at,
      data.refresh_expire_at,
      data.device_type,
      data.device_id,
      data.login_ip,
      data.login_status,
      data.user_id
    ]
  );
}

/**
 * 按会话 ID 更新登录会话。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {Object} data 会话更新参数，需包含 id。
 * @returns {Promise<void>} 无返回值。
 */
export async function updateLoginSessionById(conn, data) {
  await conn.execute(
    `
    UPDATE user_login_session
    SET session_key = ?, access_token = ?, refresh_token = ?,
        access_expire_at = ?, refresh_expire_at = ?, device_type = ?, device_id = ?,
        login_ip = ?, login_status = ?, updated_at = NOW()
    WHERE id = ?
    `,
    [
      data.session_key,
      data.access_token,
      data.refresh_token,
      data.access_expire_at,
      data.refresh_expire_at,
      data.device_type,
      data.device_id,
      data.login_ip,
      data.login_status,
      data.id,
    ]
  );
}

/**
 * 创建登录会话。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {Object} data 会话创建参数。
 * @returns {Promise<void>} 无返回值。
 */
export async function createLoginSession(conn, data) {
  await conn.execute(
    `
    INSERT INTO user_login_session
    (user_id, session_key, access_token, refresh_token, access_expire_at, refresh_expire_at, device_type, device_id, login_ip, login_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      data.user_id,
      data.session_key,
      data.access_token,
      data.refresh_token,
      data.access_expire_at,
      data.refresh_expire_at,
      data.device_type,
      data.device_id,
      data.login_ip,
      data.login_status
    ]
  );
}

/**
 * 根据 refresh token 查询登录会话。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {string} refreshToken 刷新令牌。
 * @returns {Promise<Object|null>} 会话记录，不存在时返回 null。
 */
export async function findLoginSessionByRefreshToken(conn, refreshToken) {
  const [rows] = await conn.execute(
    `
    SELECT id, user_id, refresh_token, refresh_expire_at, login_status
    FROM user_login_session
    WHERE refresh_token = ?
    LIMIT 1
    `,
    [refreshToken]
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 根据 access token 查询登录会话。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {string} accessToken 访问令牌。
 * @returns {Promise<Object|null>} 会话记录，不存在时返回 null。
 */
export async function findLoginSessionByAccessToken(conn, accessToken) {
  const [rows] = await conn.execute(
    `
    SELECT id, user_id, access_token, access_expire_at, refresh_token, refresh_expire_at, login_status
    FROM user_login_session
    WHERE access_token = ?
    LIMIT 1
    `,
    [accessToken]
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 按会话 ID 更新 access/refresh token。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{id:number|string,access_token:string,refresh_token:string,access_expire_at:Date,refresh_expire_at:Date,login_ip:string|null}} data 令牌与过期时间参数。
 * @returns {Promise<void>} 无返回值。
 */
export async function updateTokensBySessionId(conn, { id, access_token, refresh_token, access_expire_at, refresh_expire_at, login_ip }) {
  await conn.execute(
    `
    UPDATE user_login_session 
    SET access_token = ?, refresh_token = ?, access_expire_at = ?, refresh_expire_at = ?, login_ip = ?, updated_at = NOW()
    WHERE id = ?
     `,
    [access_token, refresh_token, access_expire_at, refresh_expire_at, login_ip, id]
  );
}

/**
 * 将会话状态置为已登出。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{id:number|string}} data 包含会话 ID 的参数。
 * @returns {Promise<void>} 无返回值。
 */
export async function revokeSessionById(conn, { id }) {
  await conn.execute(
    `
    UPDATE user_login_session
    SET login_status = 2, updated_at = NOW()
    WHERE id = ?
    `,
    [id]
  );
}