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

// Pobieranie wartości ze zmiennych środowiskowych (Render Environment Variables)
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const BOT_APP_ID = process.env.BOT_APP_ID;
const COMMAND_NAME = process.env.COMMAND_NAME;
const STATUS_TEXT = process.env.STATUS_TEXT;

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

let messageTimeout = null;

// Funkcja wysyłająca interakcję Slash
async function triggerSlashCommand() {
  if (!GUILD_ID || !CHANNEL_ID || !BOT_APP_ID || !COMMAND_NAME) {
    console.error('[!] ERROR: Missing environment variables for slash command execution.');
    return;
  }

  try {
    const payload = {
      type: 2,
      application_id: BOT_APP_ID,
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      data: {
        version: '1',
        name: COMMAND_NAME,
        type: 1
      }
    };

    const response = await fetch('https://discord.com/api/v10/interactions', {
      method: 'POST',
      headers: {
        'Authorization': TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 204 || response.ok) {
      console.log(`[+] Executed command interaction: /${COMMAND_NAME}`);
    } else {
      const errData = await response.json();
      console.error('[!] Interaction dispatch failed:', errData);
    }
  } catch (err) {
    console.error('[!] Network request error:', err.message);
  }

  // Losowanie interwału wywołania: 24h + od 15 do 90 minut
  const base24h = 24 * 60 * 60 * 1000;
  const randomMinutes = Math.floor(Math.random() * (90 - 15 + 1)) + 15;
  const randomDelayMs = base24h + (randomMinutes * 60 * 1000);

  console.log(`[+] Next scheduled trigger in 24h and ${randomMinutes}m.`);

  messageTimeout = setTimeout(triggerSlashCommand, randomDelayMs);
}

// Połączenie z bramką Gateway (utrzymywanie statusu i odbiór logów)
function connect() {
  if (!TOKEN) {
    console.error('[!] ERROR: DISCORD_TOKEN is missing!');
    return;
  }

  const ws = new WebSocket(GATEWAY_URL);
  let heartbeatInterval = null;

  ws.on('open', () => {
    console.log('[+] Connected to Discord Gateway.');
  });

  ws.on('message', (data) => {
    const payload = JSON.parse(data);
    const { op, t, d } = payload;

    // 1. Nawiązanie sesji i Heartbeat
    if (op === 10) {
      const interval = d.heartbeat_interval;

      heartbeatInterval = setInterval(() => {
        ws.send(JSON.stringify({ op: 1, d: null }));
      }, interval);

      const authPayload = {
        op: 2,
        d: {
          token: TOKEN,
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
      console.log('[+] Gateway session authorized and status updated.');

      if (!messageTimeout) {
        triggerSlashCommand();
      }
    }

    // 2. Nasłuchiwanie odpowiedzi bota (w tym wiadomości Ephemeral/niewidocznych dla innych)
    if (t === 'MESSAGE_CREATE') {
      if (d.channel_id === CHANNEL_ID && d.author && d.author.id === BOT_APP_ID) {        
        const isEphemeral = (d.flags & 64) === 64;
        
        console.log(`\n============== RESPONSE RECEIVED (${isEphemeral ? 'Ephemeral / Private' : 'Public'}) ==============`);
        
        if (d.content) {
          console.log(`[CONTENT]: ${d.content}`);
        }

        if (d.embeds && d.embeds.length > 0) {
          d.embeds.forEach((embed, index) => {
            console.log(`[EMBED #${index + 1} Title]: ${embed.title || 'N/A'}`);
            console.log(`[EMBED #${index + 1} Description]: ${embed.description || 'N/A'}`);
            if (embed.fields) {
              embed.fields.forEach(f => {
                console.log(`  - ${f.name}: ${f.value}`);
              });
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
