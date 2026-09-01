import assert from 'node:assert/strict';
import WebSocket from 'ws';

const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const connections = Math.max(1, Math.min(Number(process.env.CHAT_WS_CONNECTIONS || 50), 1200));
const timeoutMs = Math.max(1000, Number(process.env.CHAT_WS_TIMEOUT_MS || 15000));
const wsUrl = `${baseUrl.replace(/^http/i, 'ws')}/api/chat/live`;

function openClient(index) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, {
      handshakeTimeout: timeoutMs,
    });
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`client ${index} timed out`));
    }, timeoutMs);

    ws.once('message', (raw) => {
      clearTimeout(timer);
      let payload;
      try {
        payload = JSON.parse(String(raw));
      } catch (error) {
        ws.close();
        reject(new Error(`client ${index} received invalid JSON`));
        return;
      }
      try {
        assert.equal(payload.type, 'chat.ready');
        assert.equal(typeof payload.onlineCount, 'number');
        assert.ok(payload.eligibility && typeof payload.eligibility === 'object');
        resolve(ws);
      } catch (error) {
        ws.close();
        reject(error);
      }
    });
    ws.once('error', reject);
  });
}

const opened = [];
try {
  for (let start = 0; start < connections; start += 100) {
    const batchSize = Math.min(100, connections - start);
    const batch = await Promise.all(
      Array.from({ length: batchSize }, (_, offset) => openClient(start + offset)),
    );
    opened.push(...batch);
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`chat realtime smoke passed: ${opened.length} connections -> ${wsUrl}`);
} finally {
  for (const ws of opened) {
    ws.close();
  }
}
