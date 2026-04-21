// -- 3. 志愿者基本信息表
// CREATE TABLE `volunteers` (
//                               `user_id` int NOT NULL,
//                               `name` varchar(50) NOT NULL,
//                               `student_id` varchar(50) NOT NULL,
//                               `phone` varchar(20) DEFAULT NULL,
//                               `volunteer_hours` decimal(10,1) NOT NULL DEFAULT 0 COMMENT '志愿时长（小时）',
//                               `project_count` int NOT NULL DEFAULT 0 COMMENT '志愿项目数',
//                               `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
//                               `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//                               PRIMARY KEY (`user_id`),
//                               CONSTRAINT `fk_volunteer_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
// ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/**
 * 根据用户 ID 查询志愿者信息。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} userId 用户 ID。
 * @returns {Promise<{user_id:number,name:string,student_id:string,phone:string|null,volunteer_hours:string|number,project_count:number}|null>} 志愿者信息，不存在时返回 null。
 */
export async function findVolunteerByUserId(conn, userId) {
  const [rows] = await conn.execute(
    `
    SELECT user_id, name, student_id, phone, volunteer_hours, project_count
    FROM volunteers 
    WHERE user_id = ? 
    LIMIT 1
    `,
    [userId]
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 创建志愿者信息。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{user_id:number|string,name:string,student_id:string,phone:string|null}} data 志愿者字段。
 * @returns {Promise<number>} 新增记录的 insertId。
 */
export async function createVolunteer(conn, { user_id, name, student_id, phone }) {
  const [result] = await conn.execute(
    `
    INSERT INTO volunteers (user_id, name, student_id, phone, volunteer_hours, project_count)
    VALUES (?, ?, ?, ?, 0, 0)
    `,
    [user_id, name, student_id, phone]
  );
  return result.insertId;
}

/**
 * 根据用户 ID 更新志愿者信息。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{user_id:number|string,name:string,student_id:string,phone:string|null}} data 志愿者更新字段。
 * @returns {Promise<void>} 无返回值。
 */
export async function updateVolunteerByUserId(conn, { user_id, name, student_id, phone }) {
  await conn.execute(
    `
    UPDATE volunteers SET 
    name = ?, 
    student_id = ?, 
    phone = ? 
    WHERE user_id = ?
    `,
    [name, student_id, phone, user_id]
  );
}

/**
 * 重新根据参与记录汇总并回写志愿者派生字段。
 * 统计逻辑从全量记录重新计算，不依赖旧值累加。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} userId 用户 ID。
 * @returns {Promise<void>} 无返回值。
 */
export async function refreshVolunteerDerivedFieldsByUserId(conn, userId) {
  const [summaryRows] = await conn.execute(
    `
    SELECT
      COALESCE(SUM(CASE WHEN p.is_valid = 1 AND p.settlement_hours IS NOT NULL THEN CAST(p.settlement_hours AS DECIMAL(10,1)) ELSE 0 END), 0) AS volunteer_hours,
      COALESCE(SUM(CASE WHEN p.is_valid = 1 AND p.settlement_hours IS NOT NULL THEN 1 ELSE 0 END), 0) AS project_count
    FROM volunteer_project_participants p
    WHERE p.user_id = ?
    `,
    [userId]
  );

  const summary = Array.isArray(summaryRows) && summaryRows.length > 0 ? summaryRows[0] : null;
  await conn.execute(
    `
    UPDATE volunteers
    SET volunteer_hours = ?, project_count = ?
    WHERE user_id = ?
    `,
    [
      Number(summary?.volunteer_hours || 0),
      Number(summary?.project_count || 0),
      userId,
    ]
  );
}

/**
 * 结算成功后按增量更新志愿者汇总字段。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} userId 用户 ID。
 * @param {number} settlementHours 结算时长。
 * @returns {Promise<void>} 无返回值。
 */
export async function incrementVolunteerSummaryByUserId(conn, userId, settlementHours) {
  await conn.execute(
    `
    UPDATE volunteers
    SET volunteer_hours = ROUND(volunteer_hours + ?, 1),
        project_count = project_count + 1
    WHERE user_id = ?
    `,
    [settlementHours, userId]
  );
}

/**
 * 申请审核通过时按差值调整志愿时长。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} userId 用户 ID。
 * @param {number} deltaHours 时长差值（可正可负）。
 * @returns {Promise<void>} 无返回值。
 */
export async function adjustVolunteerHoursByDelta(conn, userId, deltaHours) {
  await conn.execute(
    `
    UPDATE volunteers
    SET volunteer_hours = ROUND(volunteer_hours + ?, 1)
    WHERE user_id = ?
    `,
    [deltaHours, userId]
  );
}

/**
 * 管理员分页查询志愿者列表（支持多条件组合筛选）。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{name?:string,studentId?:string,volunteerHoursMin?:number,volunteerHoursMax?:number,projectCountMin?:number,projectCountMax?:number,limit:number,offset:number}} filters 查询条件。
 * @returns {Promise<{items: object[], total:number}>} 列表与总数。
 */
export async function queryVolunteersForAdmin(conn, filters) {
  const safeLimit = Number.isInteger(filters.limit) && filters.limit > 0 ? filters.limit : 20;
  const safeOffset = Number.isInteger(filters.offset) && filters.offset >= 0 ? filters.offset : 0;

  const whereParts = [];
  const params = [];

  if (filters.name) {
    whereParts.push("v.name LIKE ?");
    params.push(`%${filters.name}%`);
  }
  if (filters.studentId) {
    whereParts.push("v.student_id LIKE ?");
    params.push(`%${filters.studentId}%`);
  }
  if (filters.volunteerHoursMin !== undefined) {
    whereParts.push("v.volunteer_hours >= ?");
    params.push(filters.volunteerHoursMin);
  }
  if (filters.volunteerHoursMax !== undefined) {
    whereParts.push("v.volunteer_hours <= ?");
    params.push(filters.volunteerHoursMax);
  }
  if (filters.projectCountMin !== undefined) {
    whereParts.push("v.project_count >= ?");
    params.push(filters.projectCountMin);
  }
  if (filters.projectCountMax !== undefined) {
    whereParts.push("v.project_count <= ?");
    params.push(filters.projectCountMax);
  }

  const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

  const [countRows] = await conn.execute(
    `
    SELECT COUNT(*) AS total
    FROM volunteers v
    LEFT JOIN users u ON u.user_id = v.user_id
    ${whereSql}
    `,
    params
  );

  const [rows] = await conn.execute(
    `
    SELECT
      v.user_id,
      v.name,
      v.student_id,
      v.phone,
      v.volunteer_hours,
      v.project_count,
      v.created_at,
      v.updated_at,
      u.nickname,
      u.avatar_url,
      u.role
    FROM volunteers v
    LEFT JOIN users u ON u.user_id = v.user_id
    ${whereSql}
    ORDER BY v.updated_at DESC, v.user_id DESC
    LIMIT ${safeLimit} OFFSET ${safeOffset}
    `,
    params
  );

  return {
    items: Array.isArray(rows) ? rows : [],
    total: Number(countRows?.[0]?.total || 0),
  };
}

/**
 * 管理员按 user_id 查询志愿者详情。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} userId 用户 ID。
 * @returns {Promise<object|null>} 志愿者详情。
 */
export async function findVolunteerDetailByUserIdForAdmin(conn, userId) {
  const [rows] = await conn.execute(
    `
    SELECT
      v.user_id,
      v.name,
      v.student_id,
      v.phone,
      v.volunteer_hours,
      v.project_count,
      v.created_at,
      v.updated_at,
      u.nickname,
      u.avatar_url,
      u.role
    FROM volunteers v
    LEFT JOIN users u ON u.user_id = v.user_id
    WHERE v.user_id = ?
    LIMIT 1
    `,
    [userId]
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

