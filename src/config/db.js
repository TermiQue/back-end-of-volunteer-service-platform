import mysql from 'mysql2/promise';
import { logger } from '../utils/logger.js';
import {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME
} from './constants.js';

function dbConfig() {
    return {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };
}

// 创建连接池
export const pool = mysql.createPool(dbConfig());

logger.info('database pool initialized', {
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
});