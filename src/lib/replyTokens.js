const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const normalizeToken = (token) => (token || '').toString().trim().toLowerCase();

const resolveDatabasePath = () => {
  const configuredPath = process.env.REPLY_TOKEN_DB_PATH;

  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  return path.resolve(__dirname, '..', '..', 'data', 'replyTokens.sqlite');
};

const ensureDirectory = (filePath) => {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
};

const dbPath = resolveDatabasePath();
ensureDirectory(dbPath);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.prepare(
  `CREATE TABLE IF NOT EXISTS reply_tokens (
    token TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    sender_name TEXT,
    recipient_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER
  )`
).run();

const insertTokenStmt = db.prepare(
  `INSERT INTO reply_tokens (token, sender_id, sender_name, recipient_id, created_at, last_used_at)
   VALUES (?, ?, ?, ?, ?, NULL)`
);
const selectTokenStmt = db.prepare(
  `SELECT token, sender_id AS senderId, sender_name AS senderName, recipient_id AS recipientId, created_at AS createdAt, last_used_at AS lastUsedAt
   FROM reply_tokens
   WHERE token = ?
   LIMIT 1`
);
const updateLastUsedStmt = db.prepare('UPDATE reply_tokens SET last_used_at = ? WHERE token = ?');

const generateToken = () => crypto.randomBytes(3).toString('hex'); // 6 hex chars

const createReplyToken = ({ senderId, senderName, recipientId }) => {
  if (!senderId || !recipientId) {
    throw new Error('senderId and recipientId are required to create a reply token');
  }

  const normalizedSenderName = senderName || null;
  const createdAt = Date.now();

  while (true) {
    const token = generateToken();

    try {
      insertTokenStmt.run(token, senderId, normalizedSenderName, recipientId, createdAt);
      return token;
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        continue;
      }

      throw error;
    }
  }
};

const getReplyContext = (token) => {
  const normalized = normalizeToken(token);

  if (!normalized) {
    return null;
  }

  const context = selectTokenStmt.get(normalized);

  if (!context) {
    return null;
  }

  updateLastUsedStmt.run(Date.now(), normalized);

  return context;
};

module.exports = {
  createReplyToken,
  getReplyContext,
  normalizeToken,
};
