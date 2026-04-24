/**
 * 创建一条通知记录。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{type:string,title:string,content:string,sender_id:number|string|null,receiver_id:number|string,extra_data?:object|null,redirect_url?:string|null}} data 通知参数。
 * @returns {Promise<number>} 新增通知 ID。
 */
export async function createNotification(conn, data) {
  const [result] = await conn.execute(
    `
    INSERT INTO notifications (
      type,
      title,
      content,
      sender_id,
      receiver_id,
      extra_data,
      redirect_url
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      data.type,
      data.title,
      data.content,
      data.sender_id ?? null,
      data.receiver_id,
      data.extra_data ? JSON.stringify(data.extra_data) : null,
      data.redirect_url ?? null,
    ]
  );

  return result.insertId;
}

/**
 * 查询某用户的通知列表。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{receiverId:number|string,limit:number,offset:number}} filters 查询条件。
 * @returns {Promise<{items:object[],total:number,unreadCount:number}>} 列表、总数与未读数。
 */
export async function queryNotificationsByReceiver(conn, filters) {
  const safeLimit = Number.isInteger(filters.limit) && filters.limit > 0 ? filters.limit : 20;
  const safeOffset = Number.isInteger(filters.offset) && filters.offset >= 0 ? filters.offset : 0;

  const [countRows] = await conn.execute(
    `
    SELECT COUNT(*) AS total
    FROM notifications
    WHERE receiver_id = ?
      AND is_deleted = 0
    `,
    [filters.receiverId]
  );

  const [unreadRows] = await conn.execute(
    `
    SELECT COUNT(*) AS total
    FROM notifications
    WHERE receiver_id = ?
      AND is_deleted = 0
      AND is_read = 0
    `,
    [filters.receiverId]
  );

  const [rows] = await conn.execute(
    `
    SELECT
      id,
      type,
      title,
      content,
      sender_id,
      receiver_id,
      extra_data,
      redirect_url,
      is_read,
      is_deleted,
      created_at,
      read_at
    FROM notifications
    WHERE receiver_id = ?
      AND is_deleted = 0
    ORDER BY created_at DESC, id DESC
    LIMIT ${safeLimit} OFFSET ${safeOffset}
    `,
    [filters.receiverId]
  );

  return {
    items: Array.isArray(rows) ? rows : [],
    total: Number(countRows?.[0]?.total || 0),
    unreadCount: Number(unreadRows?.[0]?.total || 0),
  };
}

/**
 * 查询某用户的一条通知。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{id:number|string,receiverId:number|string}} input 查询条件。
 * @returns {Promise<object|null>} 通知记录。
 */
export async function findNotificationByIdForReceiver(conn, input) {
  const [rows] = await conn.execute(
    `
    SELECT
      id,
      type,
      title,
      content,
      sender_id,
      receiver_id,
      extra_data,
      redirect_url,
      is_read,
      is_deleted,
      created_at,
      read_at
    FROM notifications
    WHERE id = ?
      AND receiver_id = ?
      AND is_deleted = 0
    LIMIT 1
    `,
    [input.id, input.receiverId]
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 标记通知为已读。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{id:number|string,receiverId:number|string}} input 更新条件。
 * @returns {Promise<void>} 无返回值。
 */
export async function markNotificationReadById(conn, input) {
  await conn.execute(
    `
    UPDATE notifications
    SET is_read = 1,
        read_at = IFNULL(read_at, NOW())
    WHERE id = ?
      AND receiver_id = ?
      AND is_deleted = 0
    `,
    [input.id, input.receiverId]
  );
}

/**
 * 软删除通知。
 * @param {import("mysql2/promise").PoolConnection} conn 数据库连接。
 * @param {{id:number|string,receiverId:number|string}} input 删除条件。
 * @returns {Promise<void>} 无返回值。
 */
export async function softDeleteNotificationById(conn, input) {
  await conn.execute(
    `
    UPDATE notifications
    SET is_deleted = 1
    WHERE id = ?
      AND receiver_id = ?
      AND is_deleted = 0
    `,
    [input.id, input.receiverId]
  );
}
