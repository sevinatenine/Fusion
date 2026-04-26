const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  database: process.env.DB_NAME || 'fusion',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

exports.runQuery = async function(query, params) {
    const [rows] = await pool.execute(query, params);
    return rows;
}

exports.runQuerySingle = async function(query, params) {
    const rows = await exports.runQuery(query, params);
    return rows[0];
}

exports.runQueryNoResult = async function(query, params) {
    await exports.runQuery(query, params);
}

exports.runRawQuery = async (sql, params = []) => {
    const [rows] = await pool.query(sql, params);
    return rows;
};

exports.pool = pool;