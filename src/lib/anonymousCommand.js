const slackApiFetch = async (endpoint, token, body) => {
  const response = await fetch(`https://slack.com/api/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!data.ok) {
    const error = new Error(data.error || 'Slack API request failed');
    error.endpoint = endpoint;
    throw error;
  }

  return data;
};

const extractMentionAndMessage = (text = '') => {
  const mentionRegex = /<@([A-Z0-9]+)(?:\|[^>]+)?>/i;
  const mentionMatch = text.match(mentionRegex);

  if (!mentionMatch) {
    return null;
  }

  const cleanedMessage = text.replace(mentionMatch[0], '').trim();

  return {
    userId: mentionMatch[1],
    message: cleanedMessage,
  };
};

const postAnonymousDm = async ({ token, userId, message, blocks }) => {
  const conversation = await slackApiFetch('conversations.open', token, { users: userId });
  const channelId = conversation.channel && conversation.channel.id;

  if (!channelId) {
    throw new Error('Unable to open DM channel');
  }

  await slackApiFetch('chat.postMessage', token, {
    channel: channelId,
    text: message,
    unfurl_links: false,
    blocks:
      blocks ||
      [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Un amigo invisible quiere decirte algo:*\n>${message}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'Enviado vía Amigo-No-Visible',
            },
          ],
        },
      ],
  });
};

const anonymousCommand = async (payload = {}) => {
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';

  if (!text) {
    return {
      response_type: 'ephemeral',
      text: 'Escribí a quién y qué querés decir después del comando.',
    };
  }

  const mentionDetails = extractMentionAndMessage(text);

  if (!mentionDetails) {
    return {
      response_type: 'ephemeral',
      text: 'Tenés que mencionar a la persona que debería recibir el mensaje (ej: `/amigo @usuario hola`).',
    };
  }

  if (!mentionDetails.message) {
    return {
      response_type: 'ephemeral',
      text: 'Escribí un mensaje después de mencionar al destinatario.',
    };
  }

  const botToken = process.env.SLACK_BOT_TOKEN;

  if (!botToken) {
    console.error('Missing SLACK_BOT_TOKEN');
    return {
      response_type: 'ephemeral',
      text: 'El bot no está configurado para enviar mensajes. Avisale al equipo de sistemas.',
    };
  }

  const senderId = payload.user_id;
  const senderName = payload.user_name;

  console.log(
    `Amigo-No-Visible: ${payload.user_name || payload.user_id || 'unknown'} -> ${
      mentionDetails.userId
    } | ${mentionDetails.message}`
  );

  await postAnonymousDm({
    token: botToken,
    userId: mentionDetails.userId,
    message: mentionDetails.message,
  });

  const auditUserId = process.env.SLACK_AUDIT_USER;

  if (auditUserId) {
    const senderLabel = senderName ? `${senderName} (${senderId})` : senderId || 'unknown';
    try {
      await postAnonymousDm({
        token: botToken,
        userId: auditUserId,
        message: `Nuevo mensaje anónimo de ${senderLabel} para <@${mentionDetails.userId}>`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Control Amigo-No-Visible*\n• De: ${senderLabel}\n• Para: <@${mentionDetails.userId}>\n• Mensaje:\n>${mentionDetails.message}`,
            },
          },
        ],
      });
    } catch (auditError) {
      console.error('Failed to send audit DM', auditError);
    }
  }

  return {
    response_type: 'ephemeral',
    text: `Tu mensaje fue enviado de forma anónima a <@${mentionDetails.userId}>.`,
  };
};

module.exports = anonymousCommand;
