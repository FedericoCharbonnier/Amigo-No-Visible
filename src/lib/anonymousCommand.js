const { createReplyToken, getReplyContext } = require('./replyTokens');

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
  const mentionRegex = /^<@([A-Z0-9]+)(?:\|[^>]+)?>/i;
  const mentionMatch = text.match(mentionRegex);

  if (!mentionMatch) {
    return null;
  }

  const cleanedMessage = text.slice(mentionMatch[0].length).trim();

  return {
    userId: mentionMatch[1],
    message: cleanedMessage,
  };
};

const extractTokenAndMessage = (text = '') => {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return null;
  }

  const tokenMatch = trimmedText.match(/^([a-f0-9]{6,12})\s+([\s\S]+)/i);

  if (!tokenMatch) {
    return null;
  }

  const message = tokenMatch[2].trim();

  return {
    token: tokenMatch[1].toLowerCase(),
    message,
  };
};

const brandingBlock = () => ({
  type: 'context',
  elements: [
    {
      type: 'mrkdwn',
      text: 'Enviado vía Amigo-No-Visible',
    },
  ],
});

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
  const auditUserId = process.env.SLACK_AUDIT_USER;

  const mentionDetails = extractMentionAndMessage(text);

  if (mentionDetails) {
    if (!mentionDetails.message) {
      return {
        response_type: 'ephemeral',
        text: 'Escribí un mensaje después de mencionar al destinatario.',
      };
    }

    const replyToken = createReplyToken({
      senderId,
      senderName,
      recipientId: mentionDetails.userId,
    });

    console.log(
      `Amigo-No-Visible: ${payload.user_name || payload.user_id || 'unknown'} -> ${
        mentionDetails.userId
      } | ${mentionDetails.message} | token ${replyToken}`
    );

    await postAnonymousDm({
      token: botToken,
      userId: mentionDetails.userId,
      message: mentionDetails.message,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Un amigo invisible quiere decirte algo:*\n>${mentionDetails.message}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `:key: Token de respuesta: \`${replyToken}\``,
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Respondé usando \`/amigo-no-visible ${replyToken} tu mensaje\` para contestarle (cuando respondas se mostrará quién sos).`,
            },
          ],
        },
        brandingBlock(),
      ],
    });

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
                text: `*Control Amigo-No-Visible*\n• De: ${senderLabel}\n• Para: <@${mentionDetails.userId}>\n• Mensaje:\n>${mentionDetails.message}\n• Token: \`${replyToken}\``,
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
      text: `Tu mensaje fue enviado de forma anónima a <@${mentionDetails.userId}>. El destinatario recibió el token \`${replyToken}\` para poder responderte sin revelar tu identidad.`,
    };
  }

  const tokenReply = extractTokenAndMessage(text);

  if (tokenReply) {
    if (!tokenReply.message) {
      return {
        response_type: 'ephemeral',
        text: 'Escribí un mensaje después del token para poder responder.',
      };
    }

    const replyContext = getReplyContext(tokenReply.token);

    if (!replyContext) {
      return {
        response_type: 'ephemeral',
        text: `No encontramos ningún mensaje asociado al token \`${tokenReply.token}\`. Revisá que lo hayas copiado bien.`,
      };
    }

    if (replyContext.recipientId !== senderId) {
      return {
        response_type: 'ephemeral',
        text: 'Ese token no te corresponde. Solo la persona que recibió el mensaje puede usarlo para responder.',
      };
    }

    console.log(
      `Amigo-No-Visible respuesta: ${payload.user_name || payload.user_id || 'unknown'} -> ${
        replyContext.senderId
      } | ${tokenReply.message} | token ${tokenReply.token}`
    );

    const replierLabel = senderName || senderId || 'Alguien';
    const replyHeadline = `${replierLabel} respondió a tu mensaje anónimo:`;

    await postAnonymousDm({
      token: botToken,
      userId: replyContext.senderId,
      message: tokenReply.message,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${replyHeadline}*\n>${tokenReply.message}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Se usó el token \`${tokenReply.token}\`. Si querés seguir la conversación, enviá un nuevo mensaje anónimo a tu destinatario.`,
            },
          ],
        },
        brandingBlock(),
      ],
    });

    if (auditUserId) {
      const replierLabel = senderName ? `${senderName} (${senderId})` : senderId || 'unknown';
      try {
        await postAnonymousDm({
          token: botToken,
          userId: auditUserId,
          message: `Nueva respuesta anónima usando el token \`${tokenReply.token}\`.`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Control Amigo-No-Visible*\n• Respondió: ${replierLabel}\n• Token: \`${tokenReply.token}\`\n• Mensaje:\n>${tokenReply.message}`,
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
      text: 'Tu respuesta (con tu nombre visible) fue enviada a la persona que inició la conversación.',
    };
  }

  return {
    response_type: 'ephemeral',
    text: 'Tenés que mencionar a la persona que debería recibir el mensaje (ej: `/amigo-no-visible @usuario hola`) o usar un token para responder (ej: `/amigo-no-visible 1a2b3c gracias!`).',
  };
};

module.exports = anonymousCommand;
