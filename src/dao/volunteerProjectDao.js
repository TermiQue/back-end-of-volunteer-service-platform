// -- 6. 志愿项目表（以 docs/database.md 为准）
// CREATE TABLE `volunteer_projects` (
//   `project_id` int NOT NULL AUTO_INCREMENT,
//   `name` varchar(200) NOT NULL,
//   `description` text,
//   `start_time` datetime NOT NULL,
//   `end_time` datetime NOT NULL,
//   `duration_hours` decimal(10,1) NOT NULL COMMENT '志愿时长（小时）',
//   `status` tinyint NOT NULL DEFAULT 0 COMMENT '0:未开启/草稿, 1:进行中, 2:已结束',
//   `created_by_id` int NOT NULL COMMENT '创建者user_id',
//   `responsible_id` int NOT NULL COMMENT '负责人user_id',
//   `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
//   `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//   PRIMARY KEY (`project_id`),
//   KEY `idx_status` (`status`),
//   KEY `idx_start_time` (`start_time`)
// ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

const PROJECT_SELECT_COLUMNS = `
  project_id,
  name,
  description,
  start_time,
  end_time,
  duration_hours,
  status,
  created_by_id,
  responsible_id,
  created_at,
  updated_at
`;

/**
 * 创建志愿项目（默认按文档语义创建为草稿状态）。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{name:string,description:string,start_time:string,end_time:string,duration_hours:number|string,created_by_id:number|string,responsible_id:number|string,status?:number}} project 项目参数。
 * @returns {Promise<number>} 新项目 ID。
 */
export async function createVolunteerProject(conn, project) {
  const [result] = await conn.execute(
    `
    INSERT INTO volunteer_projects (name, description, start_time, end_time, duration_hours, status, created_by_id, responsible_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      project.name,
      project.description,
      project.start_time,
      project.end_time,
      project.duration_hours,
      project.status ?? 0,
      project.created_by_id,
      project.responsible_id,
    ]
  );
  return result.insertId;
}

/**
 * 根据项目 ID 查询志愿项目。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} projectId 项目 ID。
 * @returns {Promise<object|null>} 项目信息，不存在时返回 null。
 */
export async function findVolunteerProjectByProjectId(conn, projectId) {
  const [rows] = await conn.execute(
    `
    SELECT ${PROJECT_SELECT_COLUMNS}
    FROM volunteer_projects
    WHERE project_id = ?
    LIMIT 1
    `,
    [projectId]
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 多条件查询志愿项目。
 * 支持项目 ID、名称、开始/结束时间范围、时长范围、状态、创建者、负责人的任意组合过滤。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{
 *   projectId?:number,
 *   name?:string,
 *   startTimeFrom?:Date,
 *   startTimeTo?:Date,
 *   endTimeFrom?:Date,
 *   endTimeTo?:Date,
 *   durationHoursMin?:number,
 *   durationHoursMax?:number,
 *   status?:number,
 *   createdById?:number,
 *   responsibleId?:number,
 *   limit:number,
 *   offset:number,
 * }} filters 查询参数。
 * @returns {Promise<{items: object[], total: number}>} 查询结果与总数。
 */
export async function queryVolunteerProjects(conn, filters) {
  const whereParts = [];
  const params = [];

  if (filters.projectId !== undefined) {
    whereParts.push("p.project_id = ?");
    params.push(filters.projectId);
  }
  if (filters.name) {
    whereParts.push("p.name LIKE ?");
    params.push(`%${filters.name}%`);
  }
  if (filters.startTimeFrom) {
    whereParts.push("p.start_time >= ?");
    params.push(filters.startTimeFrom);
  }
  if (filters.startTimeTo) {
    whereParts.push("p.start_time <= ?");
    params.push(filters.startTimeTo);
  }
  if (filters.endTimeFrom) {
    whereParts.push("p.end_time >= ?");
    params.push(filters.endTimeFrom);
  }
  if (filters.endTimeTo) {
    whereParts.push("p.end_time <= ?");
    params.push(filters.endTimeTo);
  }
  if (filters.durationHoursMin !== undefined) {
    whereParts.push("p.duration_hours >= ?");
    params.push(filters.durationHoursMin);
  }
  if (filters.durationHoursMax !== undefined) {
    whereParts.push("p.duration_hours <= ?");
    params.push(filters.durationHoursMax);
  }
  if (filters.status !== undefined) {
    whereParts.push("p.status = ?");
    params.push(filters.status);
  }
  if (filters.createdById !== undefined) {
    whereParts.push("p.created_by_id = ?");
    params.push(filters.createdById);
  }
  if (filters.responsibleId !== undefined) {
    whereParts.push("p.responsible_id = ?");
    params.push(filters.responsibleId);
  }
  const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
  const limit = Number.isInteger(filters.limit) && filters.limit > 0 ? filters.limit : 20;
  const offset = Number.isInteger(filters.offset) && filters.offset >= 0 ? filters.offset : 0;

  const [countRows] = await conn.execute(
    `
    SELECT COUNT(*) AS total
    FROM volunteer_projects p
    ${whereSql}
    `,
    params
  );

  const [rows] = await conn.execute(
    `
    SELECT
      p.project_id,
      p.name,
      p.description,
      p.start_time,
      p.end_time,
      p.duration_hours,
      p.status,
      p.created_by_id,
      p.responsible_id,
      p.created_at,
      p.updated_at,
      creator.name AS creator_name,
      responsible.name AS responsible_name
    FROM volunteer_projects p
    LEFT JOIN volunteers creator ON creator.user_id = p.created_by_id
    LEFT JOIN volunteers responsible ON responsible.user_id = p.responsible_id
    ${whereSql}
    ORDER BY p.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
    `,
    params
  );

  return {
    items: Array.isArray(rows) ? rows : [],
    total: Number(countRows?.[0]?.total || 0),
  };
}

/**
 * 原子状态流转：仅当当前状态命中 expectedFromStatus 时更新为 toStatus。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} projectId 项目 ID。
 * @param {number} expectedFromStatus 期望旧状态。
 * @param {number} toStatus 目标状态。
 * @returns {Promise<number>} 受影响行数。
 */
export async function transitionVolunteerProjectStatus(conn, projectId, expectedFromStatus, toStatus) {
  const [result] = await conn.execute(
    `
    UPDATE volunteer_projects
    SET status = ?
    WHERE project_id = ? AND status = ?
    `,
    [toStatus, projectId, expectedFromStatus]
  );
  return result.affectedRows || 0;
}

/**
 * 更新项目负责人。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} projectId 项目 ID。
 * @param {number|string} responsibleId 新负责人 ID。
 * @returns {Promise<number>} 受影响行数。
 */
export async function updateProjectResponsibleByProjectId(conn, projectId, responsibleId) {
  const [result] = await conn.execute(
    `
    UPDATE volunteer_projects
    SET responsible_id = ?, updated_at = NOW()
    WHERE project_id = ?
    `,
    [responsibleId, projectId]
  );
  return result.affectedRows || 0;
}

/**
 * 查询项目内所有参与者对应的 user_id。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} projectId 项目 ID。
 * @returns {Promise<number[]>} 用户 ID 列表。
 */
export async function findProjectParticipantUserIds(conn, projectId) {
  const [rows] = await conn.execute(
    `
    SELECT DISTINCT user_id
    FROM volunteer_project_participants
    WHERE project_id = ?
    `,
    [projectId]
  );
  return Array.isArray(rows)
    ? rows.map((row) => Number(row.user_id)).filter((userId) => Number.isInteger(userId) && userId > 0)
    : [];
}
