const express = require('express');
const dotenv = require('dotenv');

const verifySignature = require('./lib/verifySignature');
const anonymousCommand = require('./lib/anonymousCommand');

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const keepAliveUrl = process.env.KEEPALIVE_URL;
const keepAliveIntervalMinutes = Number(process.env.KEEPALIVE_INTERVAL_MINUTES || 10);

const rawBodySaver = (req, res, buf) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString('utf8');
  }
};

app.use(express.urlencoded({ extended: true, verify: rawBodySaver }));
app.use(express.json({ verify: rawBodySaver }));

app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

const slackRequestGuard = (req, res, next) => {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!signingSecret) {
    console.error('Missing SLACK_SIGNING_SECRET');
    return res.status(500).send('Server not configured');
  }

  const requestSignature = req.headers['x-slack-signature'];
  const requestTimestamp = req.headers['x-slack-request-timestamp'];

  if (!requestSignature || !requestTimestamp) {
    return res.status(400).send('Missing Slack signature headers');
  }

  if (!req.rawBody) {
    return res.status(400).send('Missing request body');
  }

  const isValid = verifySignature({
    signingSecret,
    rawBody: req.rawBody,
    requestSignature,
    requestTimestamp,
  });

  if (!isValid) {
    return res.status(401).send('Invalid request signature');
  }

  return next();
};

app.post('/slack/commands', slackRequestGuard, async (req, res) => {
  try {
    const response = await anonymousCommand(req.body);
    return res.json(response);
  } catch (error) {
    console.error('Slash command handler failed', error);
    return res.status(500).json({
      response_type: 'ephemeral',
      text: 'Something went wrong while processing the command. Please try again.',
    });
  }
});

app.listen(port, () => {
  console.log(`Amigo-No-Visible slash-command server listening on port ${port}`);

  if (keepAliveUrl) {
    const pingKeepAlive = async () => {
      try {
        await fetch(keepAliveUrl);
        console.log(`[keepalive] Pinged ${keepAliveUrl}`);
      } catch (error) {
        console.error(`[keepalive] Failed to ping ${keepAliveUrl}`, error.message);
      }
    };

    // Kick off immediately, then keep pinging so Render's free tier stays awake.
    pingKeepAlive();
    setInterval(pingKeepAlive, keepAliveIntervalMinutes * 60 * 1000);
  }
});
