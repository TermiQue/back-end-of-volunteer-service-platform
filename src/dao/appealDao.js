/**
 * 创建申请记录。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{type:number,participant_id:number|string,applicant_id:number|string,expected_reviewer_id:number|string|null,time:number|string,reason:string}} data 申请参数。
 * @returns {Promise<number>} 新增申请 ID。
 */
export async function createAppeal(conn, data) {
  const [result] = await conn.execute(
    `
    INSERT INTO appeal (type, participant_id, applicant_id, expected_reviewer_id, time, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, 0)
    `,
    [
      data.type,
      data.participant_id,
      data.applicant_id,
      data.expected_reviewer_id,
      data.time,
      data.reason,
    ]
  );

  return result.insertId;
}

/**
 * 按申请 ID 查询申请记录。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} appealId 申请 ID。
 * @returns {Promise<object|null>} 申请记录。
 */
export async function findAppealById(conn, appealId) {
  const [rows] = await conn.execute(
    `
    SELECT
      id,
      type,
      participant_id,
      applicant_id,
      expected_reviewer_id,
      time,
      reason,
      apply_time,
      status,
      reviewer_id,
      review_time,
      review_comment
    FROM appeal
    WHERE id = ?
    LIMIT 1
    `,
    [appealId]
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 查询参与记录是否存在待审核申请。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {number|string} participantId 参与记录 ID。
 * @returns {Promise<object|null>} 待审核申请。
 */
export async function findPendingAppealByParticipantId(conn, participantId) {
  const [rows] = await conn.execute(
    `
    SELECT
      id,
      type,
      participant_id,
      applicant_id,
      expected_reviewer_id,
      time,
      reason,
      apply_time,
      status,
      reviewer_id,
      review_time,
      review_comment
    FROM appeal
    WHERE participant_id = ? AND status = 0
    LIMIT 1
    `,
    [participantId]
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 查询某申请人在某项目下是否存在待审核申请。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{applicantId:number|string,projectId:number|string}} input 查询参数。
 * @returns {Promise<object|null>} 待审核申请。
 */
export async function findPendingAppealByApplicantAndProject(conn, input) {
  const [rows] = await conn.execute(
    `
    SELECT
      a.id,
      a.type,
      a.participant_id,
      a.applicant_id,
      a.expected_reviewer_id,
      a.time,
      a.reason,
      a.apply_time,
      a.status,
      a.reviewer_id,
      a.review_time,
      a.review_comment
    FROM appeal a
    INNER JOIN volunteer_project_participants p ON p.id = a.participant_id
    WHERE a.applicant_id = ? AND p.project_id = ? AND a.status = 0
    LIMIT 1
    `,
    [input.applicantId, input.projectId]
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 审核申请（仅待审核状态可更新）。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{appealId:number|string,nextStatus:number,reviewerId:number|string,reviewComment:string}} input 审核参数。
 * @returns {Promise<number>} 受影响行数。
 */
export async function reviewAppealById(conn, input) {
  const [result] = await conn.execute(
    `
    UPDATE appeal
    SET status = ?, reviewer_id = ?, review_time = NOW(), review_comment = ?
    WHERE id = ? AND status = 0
    `,
    [input.nextStatus, input.reviewerId, input.reviewComment, input.appealId]
  );

  return result.affectedRows || 0;
}

/**
 * 查询申请列表。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{status?:number,participantId?:number,applicantId?:number,expectedReviewerId?:number,reviewerUserId?:number,limit:number,offset:number}} filters 查询条件。
 * @returns {Promise<{items:object[],total:number}>} 列表与总数。
 */
export async function queryAppeals(conn, filters) {
  const safeLimit = Number.isInteger(filters.limit) && filters.limit > 0 ? filters.limit : 20;
  const safeOffset = Number.isInteger(filters.offset) && filters.offset >= 0 ? filters.offset : 0;

  const whereParts = [];
  const params = [];

  if (filters.status !== undefined) {
    whereParts.push("a.status = ?");
    params.push(filters.status);
  }
  if (filters.participantId !== undefined) {
    whereParts.push("a.participant_id = ?");
    params.push(filters.participantId);
  }
  if (filters.applicantId !== undefined) {
    whereParts.push("a.applicant_id = ?");
    params.push(filters.applicantId);
  }
  if (filters.expectedReviewerId !== undefined) {
    whereParts.push("a.expected_reviewer_id = ?");
    params.push(filters.expectedReviewerId);
  }
  if (filters.reviewerUserId !== undefined) {
    whereParts.push("(a.expected_reviewer_id = ? OR a.reviewer_id = ?)");
    params.push(filters.reviewerUserId, filters.reviewerUserId);
  }

  const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

  const [countRows] = await conn.execute(
    `
    SELECT COUNT(*) AS total
    FROM appeal a
    ${whereSql}
    `,
    params
  );

  const [rows] = await conn.execute(
    `
    SELECT
      a.id,
      a.type,
      a.participant_id,
      a.applicant_id,
      a.expected_reviewer_id,
      a.time,
      a.reason,
      a.apply_time,
      a.status,
      a.reviewer_id,
      a.review_time,
      a.review_comment,
      p.project_id,
      p.user_id AS participant_user_id,
      p.is_valid AS participant_is_valid,
      p.settlement_hours AS participant_settlement_hours,
      pr.name AS project_name,
      expected_reviewer.name AS expected_reviewer_name,
      actual_reviewer.name AS actual_reviewer_name,
      pr.duration_hours,
      pr.status AS project_status,
      pr.responsible_id
    FROM appeal a
    INNER JOIN volunteer_project_participants p ON p.id = a.participant_id
    INNER JOIN volunteer_projects pr ON pr.project_id = p.project_id
    LEFT JOIN volunteers expected_reviewer ON expected_reviewer.user_id = a.expected_reviewer_id
    LEFT JOIN volunteers actual_reviewer ON actual_reviewer.user_id = a.reviewer_id
    ${whereSql}
    ORDER BY a.apply_time DESC, a.id DESC
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
 * 查询某申请人发起的申请列表。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{applicantId:number|string,status?:number,limit:number,offset:number}} filters 查询条件。
 * @returns {Promise<{items:object[],total:number}>} 列表与总数。
 */
export async function queryAppealsByApplicant(conn, filters) {
  const safeLimit = Number.isInteger(filters.limit) && filters.limit > 0 ? filters.limit : 20;
  const safeOffset = Number.isInteger(filters.offset) && filters.offset >= 0 ? filters.offset : 0;

  const whereParts = ["a.applicant_id = ?"];
  const params = [filters.applicantId];

  if (filters.status !== undefined) {
    whereParts.push("a.status = ?");
    params.push(filters.status);
  }

  const whereSql = `WHERE ${whereParts.join(" AND ")}`;

  const [countRows] = await conn.execute(
    `
    SELECT COUNT(*) AS total
    FROM appeal a
    ${whereSql}
    `,
    params
  );

  const [rows] = await conn.execute(
    `
    SELECT
      a.id,
      a.type,
      a.participant_id,
      a.applicant_id,
      a.expected_reviewer_id,
      a.time,
      a.reason,
      a.apply_time,
      a.status,
      a.reviewer_id,
      a.review_time,
      a.review_comment,
      p.project_id,
      p.user_id AS participant_user_id,
      p.is_valid AS participant_is_valid,
      p.settlement_hours AS participant_settlement_hours,
      pr.name AS project_name,
      pr.duration_hours,
      pr.status AS project_status,
      pr.responsible_id
    FROM appeal a
    INNER JOIN volunteer_project_participants p ON p.id = a.participant_id
    INNER JOIN volunteer_projects pr ON pr.project_id = p.project_id
    ${whereSql}
    ORDER BY a.apply_time DESC, a.id DESC
    LIMIT ${safeLimit} OFFSET ${safeOffset}
    `,
    params
  );

  return {
    items: Array.isArray(rows) ? rows : [],
    total: Number(countRows?.[0]?.total || 0),
  };
}
