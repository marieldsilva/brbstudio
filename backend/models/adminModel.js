const { pool } = require('../config/db');
const { findMissingColumnProblems } = require('../config/schemaCheck');

const REQUIRED_COLUMNS = ['admin_id', 'f_name', 'l_name', 'email', 'password'];

async function findByEmail(email) {
  const [[row]] = await pool.query(
    `SELECT admin_id AS id,
            f_name AS firstName,
            l_name AS lastName,
            email,
            password AS passwordHash
       FROM admin
      WHERE email = ?
      LIMIT 1`,
    [email]
  );
  return row || null;
}

async function create({ firstName, lastName, email, passwordHash }) {
  const [result] = await pool.query(
    'INSERT INTO admin (f_name, l_name, email, password) VALUES (?, ?, ?, ?)',
    [firstName, lastName, email, passwordHash]
  );
  return result.insertId;
}

async function verifySchema() {
  const { problems } = await findMissingColumnProblems('admin', REQUIRED_COLUMNS);

  if (problems.length > 0) problems.push('Run database/admin_table.sql in phpMyAdmin to fix this.');
  return problems;
}

module.exports = { findByEmail, create, verifySchema };
