const crypto = require('crypto');

const tokenStore = new Map();

const normalizeToken = (token) => (token || '').toString().trim().toLowerCase();

const generateToken = () => {
  let token;

  do {
    token = crypto.randomBytes(3).toString('hex'); // 6 hex chars
  } while (tokenStore.has(token));

  return token;
};

const createReplyToken = ({ senderId, senderName, recipientId }) => {
  if (!senderId || !recipientId) {
    throw new Error('senderId and recipientId are required to create a reply token');
  }

  const token = generateToken();

  tokenStore.set(token, {
    senderId,
    senderName,
    recipientId,
    createdAt: Date.now(),
    lastUsedAt: null,
  });

  return token;
};

const getReplyContext = (token) => {
  const normalized = normalizeToken(token);

  if (!normalized) {
    return null;
  }

  const context = tokenStore.get(normalized);

  if (context) {
    context.lastUsedAt = Date.now();
  }

  return context || null;
};

module.exports = {
  createReplyToken,
  getReplyContext,
  normalizeToken,
};
