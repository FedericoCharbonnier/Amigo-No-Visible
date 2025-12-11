const crypto = require('crypto');

const fiveMinutesInSeconds = 60 * 5;

const isRecent = (timestamp) => {
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  return age < fiveMinutesInSeconds;
};

const safeCompare = (a, b) => {
  const sigA = Buffer.from(a);
  const sigB = Buffer.from(b);

  if (sigA.length !== sigB.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigA, sigB);
};

function verifySignature({ signingSecret, rawBody, requestSignature, requestTimestamp }) {
  if (!signingSecret || !rawBody || !requestSignature || !requestTimestamp) {
    return false;
  }

  if (!isRecent(requestTimestamp)) {
    return false;
  }

  const [version] = requestSignature.split('=');
  const hmac = crypto.createHmac('sha256', signingSecret);
  const baseString = `${version}:${requestTimestamp}:${rawBody}`;
  const digest = `${version}=${hmac.update(baseString).digest('hex')}`;

  return safeCompare(digest, requestSignature);
}

module.exports = verifySignature;
