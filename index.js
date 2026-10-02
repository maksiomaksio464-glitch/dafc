const express = require('express');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// Prostokątny endpoint dla health checków Rendera
app.get('/', (req, res) => {
  res.send('Discord 24/7 Status Bot IS ALIVE!');
});

app.listen(PORT, () => {
  console.log(`[+] Serwer HTTP nasłuchuje na porcie ${PORT}`);
});

// --- LOGIKA WEBSOCKET DISCORDA ---
const TOKEN = process.env.DISCORD_TOKEN; // Pobieranie tokena ze zmiennych środowiskowych
const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

function connect() {
  if (!TOKEN) {
    console.error('[!] BŁĄD: Brak zmiennej środowiskowej DISCORD_TOKEN!');
    return;
  }

  const ws = new WebSocket(GATEWAY_URL);
  let heartbeatInterval = null;

  ws.on('open', () => {
    console.log('[+] Połączono z bramką Discorda.');
  });

  ws.on('message', (data) => {
    const payload = JSON.parse(data);
    const { op, d } = payload;

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
          },
        },
      };

      ws.send(JSON.stringify(authPayload));
      console.log('[+] Status Online ustawiony pomyślnie.');
    }
  });

  ws.on('close', () => {
    console.log('[-] Połączenie zamknięte. Ponowne łączenie za 5 sekund...');
    clearInterval(heartbeatInterval);
    setTimeout(connect, 5000);
  });

  ws.on('error', (err) => {
    console.error('[!] Błąd połączenia:', err.message);
    ws.close();
  });
}

connect();
