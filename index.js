const express = require('express');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Service status: OK');
});

app.listen(PORT, () => {
  console.log(`[+] Web server initialized on port ${PORT}`);
});

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const BOT_APP_ID = process.env.BOT_APP_ID;
const COMMAND_NAME = process.env.COMMAND_NAME;
const COMMAND_ID = process.env.COMMAND_ID;
const COMMAND_VERSION = process.env.COMMAND_VERSION;
const STATUS_TEXT = process.env.STATUS_TEXT;

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

let messageTimeout = null;
let activeSessionId = null; // Przechowuje prawdziwy session_id z WebSocket

function generateNonce() {
  return (BigInt(Date.now() - 1420070400000) << 22n).toString();
}

async function triggerSlashCommand() {
  if (!GUILD_ID || !CHANNEL_ID || !BOT_APP_ID || !COMMAND_NAME || !COMMAND_ID) {
    console.error('[!] ERROR: Missing required environment variables.');
    return;
  }

  const cleanToken = TOKEN ? TOKEN.trim() : '';
  const cleanAppId = String(BOT_APP_ID).trim();
  const cleanGuildId = String(GUILD_ID).trim();
  const cleanChannelId = String(CHANNEL_ID).trim();
  const cleanCmdId = String(COMMAND_ID).trim();
  const cleanCmdVersion = String(COMMAND_VERSION || '1').trim();
  const cleanCmdName = String(COMMAND_NAME).trim();

  try {
    const payload = {
      type: 2,
      application_id: cleanAppId,
      guild_id: cleanGuildId,
      channel_id: cleanChannelId,
      session_id: activeSessionId || '0', // Dynamiczne ID sesji z Gateway
      nonce: generateNonce(),
      analytics_location: 'slash_ui',
      data: {
        version: cleanCmdVersion,
        id: cleanCmdId,
        name: cleanCmdName,
        type: 1,
        options: [],
        application_command: {
          id: cleanCmdId,
          application_id: cleanAppId,
          version: cleanCmdVersion,
          default_member_permissions: null,
          type: 1,
          nsfw: false,
          name: cleanCmdName,
          description: '',
          dm_permission: true,
          contexts: null
        },
        attachments: []
      }
    };

    const response = await fetch('https://discord.com/api/v10/interactions', {
      method: 'POST',
      headers: {
        'Authorization': cleanToken,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 204 || response.ok) {
      console.log(`[+] Executed command interaction: /${cleanCmdName}`);
    } else {
      const errData = await response.json();
      console.error('[!] Interaction dispatch failed:', JSON.stringify(errData));
    }
  } catch (err) {
    console.error('[!] Network request error:', err.message);
  }

  const base24h = 24 * 60 * 60 * 1000;
  const randomMinutes = Math.floor(Math.random() * (90 - 15 + 1)) + 15;
  const randomDelayMs = base24h + (randomMinutes * 60 * 1000);

  console.log(`[+] Next scheduled trigger in 24h and ${randomMinutes}m.`);

  messageTimeout = setTimeout(triggerSlashCommand, randomDelayMs);
}

function connect() {
  if (!TOKEN) {
    console.error('[!] ERROR: DISCORD_TOKEN is missing!');
    return;
  }

  const cleanToken = TOKEN.trim();
  const ws = new WebSocket(GATEWAY_URL);
  let heartbeatInterval = null;

  ws.on('open', () => {
    console.log('[+] Connected to Discord Gateway.');
  });

  ws.on('message', (data) => {
    const payload = JSON.parse(data);
    const { op, t, d } = payload;

    if (t === 'READY') {
      activeSessionId = d.session_id;
      console.log(`[+] Gateway Session Established. Session ID: ${activeSessionId}`);
      
      if (!messageTimeout) {
        triggerSlashCommand();
      }
    }

    if (op === 10) {
      const interval = d.heartbeat_interval;

      heartbeatInterval = setInterval(() => {
        ws.send(JSON.stringify({ op: 1, d: null }));
      }, interval);

      const authPayload = {
        op: 2,
        d: {
          token: cleanToken,
          capabilities: 8189,
          properties: {
            os: 'Windows',
            browser: 'Chrome',
            device: '',
          },
          presence: {
            status: 'online',
            afk: false,
            activities: [
              {
                name: 'Custom Status',
                type: 4,
                state: STATUS_TEXT || '',
              },
            ],
          },
        },
      };

      ws.send(JSON.stringify(authPayload));
      console.log('[+] Gateway authorization sent...');
    }

    if (t === 'MESSAGE_CREATE') {
      const cleanChannelId = String(CHANNEL_ID).trim();
      const cleanBotAppId = String(BOT_APP_ID).trim();

      if (d.channel_id === cleanChannelId && d.author && d.author.id === cleanBotAppId) {        
        const isEphemeral = (d.flags & 64) === 64;
        
        console.log(`\n============== RESPONSE RECEIVED (${isEphemeral ? 'Ephemeral / Private' : 'Public'}) ==============`);
        
        if (d.content) console.log(`[CONTENT]: ${d.content}`);

        if (d.embeds && d.embeds.length > 0) {
          d.embeds.forEach((embed, index) => {
            console.log(`[EMBED #${index + 1} Title]: ${embed.title || 'N/A'}`);
            console.log(`[EMBED #${index + 1} Description]: ${embed.description || 'N/A'}`);
            if (embed.fields) {
              embed.fields.forEach(f => console.log(`  - ${f.name}: ${f.value}`));
            }
          });
        }
        console.log(`=========================================================================\n`);
      }
    }
  });

  ws.on('close', () => {
    console.log('[-] Gateway connection closed. Reconnecting in 5 seconds...');
    clearInterval(heartbeatInterval);
    setTimeout(connect, 5000);
  });

  ws.on('error', (err) => {
    console.error('[!] Gateway connection error:', err.message);
    ws.close();
  });
}

connect();
