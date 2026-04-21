/**
 * 查询用户在项目内的参与记录。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} projectId 项目 ID。
 * @param {number|string} userId 用户 ID。
 * @returns {Promise<object|null>} 参与记录。
 */
export async function findParticipantRecord(conn, projectId, userId) {
  const [rows] = await conn.execute(
    `
    SELECT
      id,
      project_id,
      user_id,
      check_in_at,
      check_out_at,
      check_in_source,
      check_out_source,
      is_valid,
      settlement_hours,
      note,
      created_at,
      updated_at
    FROM volunteer_project_participants
    WHERE project_id = ? AND user_id = ?
    LIMIT 1
    `,
    [projectId, userId]
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 按参与记录 ID 查询。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} participantId 参与记录 ID。
 * @returns {Promise<object|null>} 参与记录。
 */
export async function findParticipantRecordById(conn, participantId) {
  const [rows] = await conn.execute(
    `
    SELECT
      id,
      project_id,
      user_id,
      check_in_at,
      check_out_at,
      check_in_source,
      check_out_source,
      is_valid,
      settlement_hours,
      note,
      created_at,
      updated_at
    FROM volunteer_project_participants
    WHERE id = ?
    LIMIT 1
    `,
    [participantId]
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 列出项目内全部参与记录。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} projectId 项目 ID。
 * @returns {Promise<object[]>} 参与记录列表。
 */
export async function listParticipantRecordsByProjectId(conn, projectId) {
  const [rows] = await conn.execute(
    `
    SELECT
      id,
      project_id,
      user_id,
      check_in_at,
      check_out_at,
      check_in_source,
      check_out_source,
      is_valid,
      settlement_hours,
      note,
      created_at,
      updated_at
    FROM volunteer_project_participants
    WHERE project_id = ?
    ORDER BY id ASC
    `,
    [projectId]
  );

  return Array.isArray(rows) ? rows : [];
}

/**
 * 幂等写入签到时间：已签到时不覆盖原签到时间。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{projectId:number|string,userId:number|string,source:string,checkInAt:Date}} input 签到参数。
 * @returns {Promise<void>} 无返回值。
 */
export async function upsertParticipantCheckIn(conn, input) {
  await conn.execute(
    `
    INSERT INTO volunteer_project_participants (project_id, user_id, check_in_at, check_in_source)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      check_in_at = IFNULL(check_in_at, VALUES(check_in_at)),
      check_in_source = IFNULL(check_in_source, VALUES(check_in_source))
    `,
    [input.projectId, input.userId, input.checkInAt, input.source]
  );
}

/**
 * 幂等写入签退时间：已签退时不覆盖原签退时间。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{projectId:number|string,userId:number|string,source:string,checkOutAt:Date}} input 签退参数。
 * @returns {Promise<void>} 无返回值。
 */
export async function upsertParticipantCheckOut(conn, input) {
  await conn.execute(
    `
    INSERT INTO volunteer_project_participants (project_id, user_id, check_out_at, check_out_source)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      check_out_at = IFNULL(check_out_at, VALUES(check_out_at)),
      check_out_source = IFNULL(check_out_source, VALUES(check_out_source))
    `,
    [input.projectId, input.userId, input.checkOutAt, input.source]
  );
}

/**
 * 首次结算参与记录（仅 settlement_hours 为空时生效，确保幂等）。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{participantId:number|string,settlementHours:number,note:string}} input 结算参数。
 * @returns {Promise<number>} 受影响行数。
 */
export async function applyParticipantAutoSettlement(conn, input) {
  const [result] = await conn.execute(
    `
    UPDATE volunteer_project_participants
    SET is_valid = 1,
        settlement_hours = ?,
        note = ?,
        updated_at = NOW()
    WHERE id = ? AND settlement_hours IS NULL
    `,
    [input.settlementHours, input.note, input.participantId]
  );
  return result.affectedRows || 0;
}

/**
 * 将参与记录标记为无效。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{participantId:number|string,note:string}} input 标记参数。
 * @returns {Promise<void>} 无返回值。
 */
export async function markParticipantInvalidWithNote(conn, input) {
  await conn.execute(
    `
    UPDATE volunteer_project_participants
    SET is_valid = 0,
        settlement_hours = NULL,
        note = ?,
        updated_at = NOW()
    WHERE id = ?
    `,
    [input.note, input.participantId]
  );
}

/**
 * 按参与记录 ID 更新有效性与结算时长。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{participantId:number|string,isValid:number,settlementHours:number|null,note:string}} input 更新参数。
 * @returns {Promise<void>} 无返回值。
 */
export async function updateParticipantSettlementById(conn, input) {
  await conn.execute(
    `
    UPDATE volunteer_project_participants
    SET is_valid = ?,
        settlement_hours = ?,
        note = ?,
        updated_at = NOW()
    WHERE id = ?
    `,
    [input.isValid, input.settlementHours, input.note, input.participantId]
  );
}

/**
 * 分页查询某个用户参与过的项目。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{userId:number|string,projectStatus?:number,limit:number,offset:number}} filters 查询参数。
 * @returns {Promise<{items: object[], total: number}>} 结果集与总数。
 */
export async function queryParticipantProjectsByUserId(conn, filters) {
  const safeLimit = Number.isInteger(filters.limit) && filters.limit > 0 ? filters.limit : 20;
  const safeOffset = Number.isInteger(filters.offset) && filters.offset >= 0 ? filters.offset : 0;

  const whereParts = ["p.user_id = ?"];
  const params = [filters.userId];

  if (filters.projectStatus !== undefined) {
    whereParts.push("pr.status = ?");
    params.push(filters.projectStatus);
  }

  const whereSql = `WHERE ${whereParts.join(" AND ")}`;

  const [countRows] = await conn.execute(
    `
    SELECT COUNT(*) AS total
    FROM volunteer_project_participants p
    INNER JOIN volunteer_projects pr ON pr.project_id = p.project_id
    ${whereSql}
    `,
    params
  );

  const [rows] = await conn.execute(
    `
    SELECT
      p.id,
      p.project_id,
      p.user_id,
      p.check_in_at,
      p.check_out_at,
      p.check_in_source,
      p.check_out_source,
      p.is_valid,
      p.settlement_hours,
      p.note,
      p.created_at AS participant_created_at,
      p.updated_at AS participant_updated_at,
      pr.name AS project_name,
      pr.description AS project_description,
      pr.start_time,
      pr.end_time,
      pr.duration_hours,
      pr.status AS project_status,
      pr.created_by_id,
      pr.responsible_id,
      pr.created_at AS project_created_at,
      pr.updated_at AS project_updated_at
    FROM volunteer_project_participants p
    INNER JOIN volunteer_projects pr ON pr.project_id = p.project_id
    ${whereSql}
    ORDER BY p.updated_at DESC, p.id DESC
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
 * 查询某个用户参与过的全部项目（不分页）。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} userId 用户 ID。
 * @returns {Promise<object[]>} 参与项目列表。
 */
export async function queryAllParticipantProjectsByUserId(conn, userId) {
  const [rows] = await conn.execute(
    `
    SELECT
      p.id,
      p.project_id,
      p.user_id,
      p.check_in_at,
      p.check_out_at,
      p.check_in_source,
      p.check_out_source,
      p.is_valid,
      p.settlement_hours,
      p.note,
      p.created_at AS participant_created_at,
      p.updated_at AS participant_updated_at,
      pr.name AS project_name,
      pr.description AS project_description,
      pr.start_time,
      pr.end_time,
      pr.duration_hours,
      pr.status AS project_status,
      pr.created_by_id,
      pr.responsible_id,
      pr.created_at AS project_created_at,
      pr.updated_at AS project_updated_at
    FROM volunteer_project_participants p
    INNER JOIN volunteer_projects pr ON pr.project_id = p.project_id
    WHERE p.user_id = ?
    ORDER BY p.updated_at DESC, p.id DESC
    `,
    [userId]
  );

  return Array.isArray(rows) ? rows : [];
}
