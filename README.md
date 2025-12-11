# Amigo-No-Visible

Standalone Slack slash-command service that relays anonymous notes from `/amigo` while keeping authors hidden. It validates every request with Slack's signing secret and, when a teammate is mentioned (`/amigo @usuario mensaje`), the server uses a bot token to open a DM and deliver the note privately. The repository is ready to deploy on [Render](https://render.com/) via `render.yaml`.

## Getting started

1. Install dependencies
   ```bash
   npm install
   ```
2. Copy the environment template and fill in the real values
   ```bash
   cp .env.example .env
   ```
3. Start the local server
   ```bash
   npm start
   ```

The service listens on `PORT` (defaults to `4000`) and exposes `POST /slack/commands`, which Slack should call for the `/amigo` command. It also exposes `GET /healthz` for Render or uptime checks.

### Environment variables

| Variable | Description |
| --- | --- |
| `SLACK_SIGNING_SECRET` | Verifies incoming slash-command requests. |
| `SLACK_BOT_TOKEN` | Bot token (needs `chat:write`) used to DM the mentioned user. |
| `SLACK_AUDIT_USER` | *(Optional)* Slack user ID that receives a copy of every anonymous message for control/auditing. |
| `KEEPALIVE_URL` | *(Optional)* URL to ping (e.g. your own `/healthz`) so Render's free tier stays awake. |
| `KEEPALIVE_INTERVAL_MINUTES` | *(Optional)* Minutes between keep-alive pings (default `10`). |
| `PORT` | Optional port override (default `4000`). |

If you deploy on Render's free plan, set `KEEPALIVE_URL` to the public `/healthz` endpoint Render exposes (or any lightweight endpoint) so the service pings itself every few minutes and avoids idling.

### Slack configuration

1. Create (or reuse) a Slack app and add a Slash Command (e.g. `/amigo`). Set the Request URL to `https://<your-domain>/slack/commands`.
2. In **Basic Information → App Credentials**, copy the **Signing Secret** into `SLACK_SIGNING_SECRET`.
3. Under **OAuth & Permissions**, add the `chat:write` scope to your bot token, reinstall the app, and copy the `xoxb-...` token into `SLACK_BOT_TOKEN`.
4. (Optional) If you want to monitor usage, set `SLACK_AUDIT_USER` to your own Slack user ID so the bot DM’s you each time alguien envía un mensaje.
5. Save the slash command and reinstall the app so the bot gains DM access.

Requests that fail signature validation are rejected with `401` so only Slack can call the endpoint.

### Anonymous messaging helper

`src/lib/anonymousCommand.js` parses the slash-command payload, extracts the mentioned user, opens a DM via Slack's Web API, and posts the formatted anonymous note. Update it if you want different copy, multi-recipient support, or integrations with other systems.

## Deploying to Render

Render automatically picks up `render.yaml`:

```yaml
services:
  - type: web
    env: node
    buildCommand: npm install
    startCommand: npm run start
```

Push this repository to the Git provider Render is connected to, then:

1. Click **New > Blueprint**.
2. Point Render at the repo and confirm the plan.
3. Add `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN` as environment variables in the Render dashboard.

Render will install dependencies, run `npm run start`, and keep the slash-command online.
