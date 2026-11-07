/**
 * Hanzu Cinema — Real-Time Multi-User Cinema Server
 * Zero-dependency High-Performance HTTP + RFC 6455 WebSocket Hub
 * Allows multiple devices (phones, tablets, PCs on LAN/Internet) to connect,
 * sit in 3D seats, chat, vote, sync playback, and skip videos together.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 8080;
const ROOT_DIR = __dirname;

// MIME Types Map
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// Initial Preset Queue (Empty by default: viewers propose songs)
const INITIAL_QUEUE = [];

// Anti-spam reaction rate limiter: [userId]: [timestamp, timestamp, ...]
const userReactionTimes = new Map();

// Single Source of Truth for the Hanzu Cinema Room
const roomState = {
  code: 'rap-chung-minh',
  currentVideo: {
    videoId: '9B0yX0UIN9M',
    title: 'I Really Want to Stay at Your House',
    channel: 'Samuel Kim, Lorien - Topic',
    startedBy: 'Hanzu Cinema',
    ambilight: ['#38BDF8', '#EC4899'],
    isPlaying: true,
    startTime: Date.now()
  },
  queue: [...INITIAL_QUEUE],
  occupants: {}, // [userId]: { id, name, seat, emoji, color, isHost, joinedAt }
  skipVotes: new Set(),
  messages: [
    {
      id: 'sys-welcome',
      type: 'system',
      text: 'Chào mừng bạn đến với Hanzu Cinema — Rạp phim 3D 100 ghế!',
      time: '00:00'
    }
  ]
};

// Connected WebSocket Clients: Map of wsClient -> { id, user, socket }
const connectedClients = new Map();

/**
 * Get all available IPv4 network addresses (LAN / Wi-Fi)
 */
function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ name, address: net.address });
      }
    }
  }
  return addresses;
}

/**
 * Find an available seat if user's preferred seat is already taken
 */
function assignAvailableSeat(preferredSeat, currentOccupants) {
  const occupiedSeats = new Set(Object.values(currentOccupants).map((o) => o.seat));
  if (preferredSeat && !occupiedSeats.has(preferredSeat)) {
    return preferredSeat;
  }
  // Search standard prime rows (F, E, G, D, H, C, I, B, J, A)
  const rows = ['F', 'E', 'G', 'D', 'H', 'C', 'I', 'B', 'J', 'A'];
  for (const r of rows) {
    for (let c = 5; c <= 10; c++) {
      const code = `${r}${c}`;
      if (!occupiedSeats.has(code)) return code;
    }
    for (let c = 4; c >= 1; c--) {
      const code = `${r}${c}`;
      if (!occupiedSeats.has(code)) return code;
    }
  }
  return preferredSeat || 'E5';
}

/**
 * Ensure viewer names are independent and unique across all active occupants
 */
function assignUniqueName(desiredName, currentOccupants, excludeId = null) {
  let base = (desiredName || 'Khán giả').trim().slice(0, 24);
  const isTaken = (n) => Object.values(currentOccupants).some(
    (occ) => occ && occ.id !== excludeId && occ.name && occ.name.toLowerCase() === n.toLowerCase()
  );
  if (!isTaken(base)) return base;
  const root = base.replace(/\s*[#(]\d+[)]?$/i, '').trim() || 'Khán giả';
  let counter = 2;
  while (isTaken(`${root} #${counter}`)) {
    counter++;
  }
  return `${root} #${counter}`;
}

/**
 * Broadcast WebSocket packet to all connected clients (optionally excluding one)
 */
function broadcast(payload, excludeWs = null) {
  const jsonStr = JSON.stringify(payload);
  for (const [ws] of connectedClients) {
    if (ws !== excludeWs) {
      ws.send(jsonStr);
    }
  }
}

/**
 * Calculate required skip votes:
 * - 1 viewer: 1 vote
 * - >= 2 viewers: at least 30% of room (rounded UP with Math.ceil to always ensure >= 30%)
 *   and strictly at least 2 votes to prevent any single viewer from skipping alone
 */
function getRequiredSkipVotesServer() {
  const totalViewers = Object.keys(roomState.occupants).length || 1;
  if (totalViewers <= 1) return 1;
  const pct30 = Math.ceil(totalViewers * 0.3);
  return Math.max(2, pct30);
}

/**
 * Advance queue to next video and broadcast to all users
 */
function advanceRoomQueue(reasonText) {
  roomState.queue.sort((a, b) => b.votes - a.votes);
  if (roomState.queue.length === 0) {
    roomState.skipVotes.clear();
    roomState.currentVideo = null;
    broadcast({
      type: 'SKIP_VOTE_UPDATE',
      votes: [],
      required: getRequiredSkipVotesServer(),
      isEmpty: true
    });
    broadcast({
      type: 'QUEUE_ADVANCE',
      currentVideo: null,
      nextVideo: null,
      queue: [],
      reason: reasonText || 'Hàng đợi đã hết bài hát'
    });
    return;
  }
  const nextVideo = roomState.queue.shift();
  roomState.currentVideo = {
    videoId: nextVideo.videoId,
    title: nextVideo.title,
    channel: nextVideo.channel || 'YouTube Cinema',
    startedBy: nextVideo.addedBy || 'Khán giả',
    addedByUserId: nextVideo.addedByUserId || null,
    addedByClientId: nextVideo.addedByClientId || null,
    startedByUserId: nextVideo.startedByUserId || null,
    startedByClientId: nextVideo.startedByClientId || null,
    ambilight: nextVideo.ambilight || ['#3B82F6', '#8B5CF6'],
    isPlaying: true,
    startTime: Date.now()
  };
  roomState.skipVotes.clear();

  broadcast({
    type: 'QUEUE_ADVANCE',
    currentVideo: roomState.currentVideo,
    nextVideo: roomState.currentVideo,
    queue: roomState.queue,
    reason: reasonText
  });
}

// =============================================================================
// HTTP STATIC SERVER + REST API
// =============================================================================
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // API: Search alternative YouTube videos for embed-blocked songs
  if (pathname === '/api/search-alt') {
    const q = parsedUrl.searchParams.get('q') || '';
    const exclude = parsedUrl.searchParams.get('exclude') || '';
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=UTF-8',
      'Access-Control-Allow-Origin': '*'
    });
    if (!q) return res.end(JSON.stringify({ videoIds: [] }));
    try {
      const ytUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
      const resp = await fetch(ytUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const html = await resp.text();
      const matches = [...html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)].map((m) => m[1]);
      const unique = [...new Set(matches)].filter((id) => id !== exclude);
      return res.end(JSON.stringify({ videoIds: unique.slice(0, 8) }));
    } catch (err) {
      return res.end(JSON.stringify({ videoIds: [], error: err.message }));
    }
  }

  // API: Get YouTube Video Info (Duration & Availability) - Enforces <= 8 mins limit
  if (pathname === '/api/video-info') {
    const vid = parsedUrl.searchParams.get('id') || '';
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=UTF-8',
      'Access-Control-Allow-Origin': '*'
    });
    if (!vid) return res.end(JSON.stringify({ error: 'Missing video id' }));
    try {
      const resp = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(vid)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(4000)
      });
      const html = await resp.text();
      const lenMatch = html.match(/"lengthSeconds":"(\d+)"/);
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      const isLive = html.includes('"isLive":true') || html.includes('"isLiveContent":true');
      const lengthSeconds = isLive ? 999999 : (lenMatch ? parseInt(lenMatch[1], 10) : null);
      const title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : '';
      const isUnavailable = html.includes('Video unavailable') || html.includes('"playabilityStatus":{"status":"UNPLAYABLE"') || html.includes('"status":"ERROR"');
      return res.end(JSON.stringify({
        videoId: vid,
        lengthSeconds,
        title,
        isLive,
        available: !isUnavailable
      }));
    } catch (err) {
      return res.end(JSON.stringify({ videoId: vid, lengthSeconds: null, error: err.message }));
    }
  }

  // API: Get Server & Network Info for Friends Invite Link
  if (pathname === '/api/info') {
    const netAddrs = getNetworkAddresses();
    const primaryLan = netAddrs.find((a) => !a.name.toLowerCase().includes('vpn')) || netAddrs[0];
    const lanUrl = primaryLan ? `http://${primaryLan.address}:${PORT}` : `http://localhost:${PORT}`;

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=UTF-8',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(
      JSON.stringify({
        status: 'online',
        cinemaName: 'Hanzu Cinema',
        port: PORT,
        localUrl: `http://localhost:${PORT}`,
        lanUrl: lanUrl,
        allLanUrls: netAddrs.map((a) => ({ name: a.name, url: `http://${a.address}:${PORT}` })),
        occupantsCount: Object.keys(roomState.occupants).length
      })
    );
  }

  // Security: Prevent path traversal outside root
  let filePath = path.join(ROOT_DIR, pathname);
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  // If path is a directory, serve index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end('<h1>404 Not Found</h1><p>File không tồn tại trên máy chủ Hanzu Cinema.</p>');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
});

// =============================================================================
// RFC 6455 PURE NODE.JS WEBSOCKET HUB (ZERO DEPENDENCIES)
// =============================================================================
server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  if (pathname !== '/ws' && pathname !== '/ws/') {
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '\r\n'
  ];
  socket.write(responseHeaders.join('\r\n'));

  // Create lightweight WebSocket wrapper
  const ws = {
    socket,
    id: 'conn-' + Math.random().toString(36).slice(2, 9),
    userId: null,
    send: (data) => {
      if (socket.destroyed) return;
      try {
        const payload = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
        const len = payload.length;
        let header;
        if (len <= 125) {
          header = Buffer.from([0x81, len]);
        } else if (len <= 65535) {
          header = Buffer.alloc(4);
          header[0] = 0x81;
          header[1] = 126;
          header.writeUInt16BE(len, 2);
        } else {
          header = Buffer.alloc(10);
          header[0] = 0x81;
          header[1] = 127;
          header.writeBigUInt64BE(BigInt(len), 2);
        }
        socket.write(Buffer.concat([header, payload]));
      } catch (err) {}
    }
  };

  ws.isAlive = true;
  connectedClients.set(ws, { id: ws.id, user: null, socket });

  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const byte0 = buffer[0];
      const byte1 = buffer[1];
      const opcode = byte0 & 0x0f;
      const isMasked = (byte1 & 0x80) !== 0;
      let payloadLen = byte1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buffer.length < offset + 2) break;
        payloadLen = buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLen === 127) {
        if (buffer.length < offset + 8) break;
        payloadLen = Number(buffer.readBigUInt64BE(offset));
        offset += 8;
      }

      let mask = null;
      if (isMasked) {
        if (buffer.length < offset + 4) break;
        mask = buffer.slice(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + payloadLen) break;

      const payload = buffer.slice(offset, offset + payloadLen);
      buffer = buffer.slice(offset + payloadLen);

      if (opcode === 0x08) {
        // Client close frame
        socket.end();
        handleClientDisconnect(ws);
        return;
      }
      if (opcode === 0x09) {
        // Ping -> Reply Pong
        socket.write(Buffer.from([0x8a, 0x00]));
        continue;
      }
      if (opcode === 0x0a) {
        // Pong
        continue;
      }

      if (mask) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i % 4];
        }
      }

      const text = payload.toString('utf8');
      try {
        const msg = JSON.parse(text);
        handleClientMessage(ws, msg);
      } catch (e) {}
    }
  });

  const onSocketCleanUp = () => {
    handleClientDisconnect(ws);
  };

  socket.on('close', onSocketCleanUp);
  socket.on('error', onSocketCleanUp);
});

// Heartbeat ping interval every 25s
setInterval(() => {
  for (const [ws] of connectedClients) {
    if (!ws.socket.destroyed) {
      try {
        ws.socket.write(Buffer.from([0x89, 0x00])); // Ping frame
      } catch (e) {}
    }
  }
}, 25000);

/**
 * Handle incoming WebSocket messages from clients
 */
function handleClientMessage(ws, data) {
  if (!data || !data.type) return;

  switch (data.type) {
    case 'INIT_USER': {
      if (!data.user || !data.user.id) return;
      const user = data.user;
      ws.userId = user.id;

      // Ensure no two people sit on the exact same seat
      const finalSeat = assignAvailableSeat(user.seat, roomState.occupants);
      user.seat = finalSeat;

      // Ensure no two viewers have the exact same name
      const finalName = assignUniqueName(user.name, roomState.occupants, user.id);
      user.name = finalName;

      const gender = (user.gender === 'female' || user.gender === 'other') ? user.gender : 'male';
      roomState.occupants[user.id] = {
        id: user.id,
        name: finalName,
        gender: gender,
        seat: finalSeat,
        emoji: user.emoji || '😎',
        color: user.color || '#3B82F6',
        joinedAt: Date.now()
      };

      connectedClients.set(ws, { id: ws.id, user: roomState.occupants[user.id], socket: ws.socket });

      // 1. Reply to connecting user with Full Room State
      let elapsedSec = 0;
      if (roomState.currentVideo && roomState.currentVideo.startTime) {
        elapsedSec = Math.max(0, Math.floor((Date.now() - roomState.currentVideo.startTime) / 1000));
      }
      ws.send({
        type: 'ROOM_SYNC',
        assignedSeat: finalSeat,
        assignedName: finalName,
        currentVideo: roomState.currentVideo,
        currentTime: elapsedSec,
        queue: roomState.queue,
        occupants: roomState.occupants,
        skipVotes: Array.from(roomState.skipVotes),
        messages: roomState.messages.slice(-30)
      });

      // 2. Broadcast new viewer to all other connected clients
      broadcast(
        {
          type: 'USER_JOINED',
          user: roomState.occupants[user.id]
        },
        ws
      );

      // 3. Broadcast updated skip vote requirement to all clients as headcount changed
      broadcast({
        type: 'SKIP_VOTE_UPDATE',
        votes: Array.from(roomState.skipVotes),
        required: getRequiredSkipVotesServer()
      });

      // 3. Add system welcome message in chat
      const sysNotice = {
        id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        type: 'system',
        text: `👋 ${user.name} đã vào rạp Hanzu Cinema và ngồi ở ghế ${finalSeat}!`,
        time: new Date().toTimeString().slice(0, 5)
      };
      roomState.messages.push(sysNotice);
      if (roomState.messages.length > 80) roomState.messages.shift();
      broadcast({ type: 'CHAT_MSG', msg: sysNotice });
      break;
    }

    case 'SEAT_CHANGE': {
      if (!ws.userId || !roomState.occupants[ws.userId]) return;
      const newSeat = data.seat;
      if (!newSeat) return;

      // Check if seat is already occupied by someone else
      const isTaken = Object.values(roomState.occupants).some(
        (o) => o.seat === newSeat && o.id !== ws.userId
      );
      if (isTaken) {
        ws.send({
          type: 'SEAT_TAKEN_ERROR',
          seat: newSeat,
          message: `Ghế ${newSeat} đã có người ngồi!`
        });
        return;
      }

      if (data.user) {
        if (data.user.name) roomState.occupants[ws.userId].name = String(data.user.name).trim().slice(0, 24);
        if (data.user.gender) roomState.occupants[ws.userId].gender = data.user.gender;
        if (data.user.emoji) roomState.occupants[ws.userId].emoji = data.user.emoji;
        if (data.user.color) roomState.occupants[ws.userId].color = data.user.color;
      }
      roomState.occupants[ws.userId].seat = newSeat;
      broadcast({
        type: 'SEAT_CHANGE',
        userId: ws.userId,
        seat: newSeat,
        user: roomState.occupants[ws.userId]
      });
      break;
    }

    case 'PROFILE_UPDATE': {
      if (!ws.userId || !roomState.occupants[ws.userId] || !data.user) return;
      const occ = roomState.occupants[ws.userId];
      if (data.user.name) occ.name = assignUniqueName(data.user.name, roomState.occupants, ws.userId);
      if (data.user.gender) occ.gender = (data.user.gender === 'female' || data.user.gender === 'other') ? data.user.gender : 'male';
      if (data.user.emoji) occ.emoji = data.user.emoji;
      if (data.user.color) occ.color = data.user.color;
      broadcast({
        type: 'PROFILE_UPDATED',
        userId: ws.userId,
        user: occ
      });
      break;
    }

    case 'CHAT_MSG': {
      if (!ws.userId || !roomState.occupants[ws.userId]) return;
      const user = roomState.occupants[ws.userId];
      const chatMsg = {
        id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        author: user.name,
        seat: user.seat,
        emoji: user.emoji,
        color: user.color,
        text: String(data.text || '').slice(0, 280),
        time: new Date().toTimeString().slice(0, 5),
        isMe: false
      };
      roomState.messages.push(chatMsg);
      if (roomState.messages.length > 80) roomState.messages.shift();
      broadcast({ type: 'CHAT_MSG', msg: chatMsg });
      break;
    }

    case 'REACTION': {
      if (!ws.userId || !roomState.occupants[ws.userId]) return;
      const user = roomState.occupants[ws.userId];
      const now = Date.now();
      if (!userReactionTimes.has(ws.userId)) {
        userReactionTimes.set(ws.userId, []);
      }
      const history = userReactionTimes.get(ws.userId).filter(t => now - t < 1000);
      if (history.length >= 4) {
        // Drop excess reactions to prevent spamming server and viewers
        return;
      }
      history.push(now);
      userReactionTimes.set(ws.userId, history);

      broadcast({
        type: 'REACTION',
        seat: user.seat,
        emoji: data.emoji || '🍿',
        userId: user.id
      });
      break;
    }

    case 'ADD_QUEUE': {
      if (!data.item || !data.item.videoId) return;
      // Duration limit: max 480 seconds (8 minutes)
      if (data.item.lengthSeconds && data.item.lengthSeconds > 480) {
        ws.send({
          type: 'VIDEO_LIMIT_REJECTED',
          videoId: data.item.videoId,
          title: data.item.title,
          lengthSeconds: data.item.lengthSeconds,
          message: 'Video dài quá 8 phút. Vui lòng chọn bài khác!'
        });
        return;
      }
      if (!roomState.queue.some((q) => q.id === data.item.id)) {
        roomState.queue.push({
          ...data.item,
          addedByUserId: data.item.addedByUserId || ws.userId || null,
          addedByClientId: data.item.addedByClientId || null
        });
        if (!roomState.currentVideo || !roomState.currentVideo.videoId) {
          advanceRoomQueue('Chiếu ngay video vừa đề xuất');
        } else {
          broadcast({
            type: 'QUEUE_UPDATE',
            queue: roomState.queue
          });
        }
      }
      break;
    }

    case 'VOTE_QUEUE_ITEM': {
      if (!data.itemId) return;
      const item = roomState.queue.find((q) => q.id === data.itemId);
      if (item) {
        item.votes = (item.votes || 0) + 1;
        roomState.queue.sort((a, b) => b.votes - a.votes);
        broadcast({
          type: 'QUEUE_UPDATE',
          queue: roomState.queue
        });
      }
      break;
    }

    case 'SKIP_VOTE': {
      if (!ws.userId) return;
      if (roomState.queue.length === 0) return; // Cannot vote skip if queue is empty

      roomState.skipVotes.add(ws.userId);
      const totalViewers = Object.keys(roomState.occupants).length || 1;
      const required = getRequiredSkipVotesServer();

      if (roomState.skipVotes.size >= required) {
        const pct = Math.round((roomState.skipVotes.size / totalViewers) * 100);
        const reason = `Đã đủ ${roomState.skipVotes.size}/${required} phiếu (${pct}% khán giả đồng ý)`;
        advanceRoomQueue(reason);
      } else {
        broadcast({
          type: 'SKIP_VOTE_UPDATE',
          votes: Array.from(roomState.skipVotes),
          required
        });
      }
      break;
    }

    case 'SKIP_VOTE_REVOKE': {
      if (!ws.userId) return;
      roomState.skipVotes.delete(ws.userId);
      const required = getRequiredSkipVotesServer();
      broadcast({
        type: 'SKIP_VOTE_UPDATE',
        votes: Array.from(roomState.skipVotes),
        required
      });
      break;
    }

    case 'FORCE_PLAY_QUEUE': {
      if (!data.itemId) return;
      const idx = roomState.queue.findIndex((q) => q.id === data.itemId);
      if (idx === -1) return;
      const [picked] = roomState.queue.splice(idx, 1);
      roomState.currentVideo = {
        videoId: picked.videoId,
        title: picked.title,
        channel: picked.channel || 'YouTube Cinema',
        startedBy: picked.addedBy || 'Khán giả',
        addedByUserId: picked.addedByUserId || ws.userId || null,
        addedByClientId: picked.addedByClientId || null,
        startedByUserId: ws.userId || null,
        ambilight: picked.ambilight || ['#3B82F6', '#8B5CF6'],
        isPlaying: true,
        startTime: Date.now()
      };
      roomState.skipVotes.clear();
      broadcast({
        type: 'QUEUE_ADVANCE',
        currentVideo: roomState.currentVideo,
        queue: roomState.queue,
        reason: `Chiếu ngay bởi ${roomState.occupants[ws.userId]?.name || 'Khán giả'}`
      });
      break;
    }

    case 'LOAD_VIDEO': {
      if (!data.video || !data.video.videoId) return;
      if (data.video.lengthSeconds && data.video.lengthSeconds > 480) {
        return;
      }
      roomState.currentVideo = {
        videoId: data.video.videoId,
        title: data.video.title,
        channel: data.video.channel || 'YouTube Cinema',
        startedBy: data.video.startedBy || (ws.userId && roomState.occupants[ws.userId]?.name) || 'Khán giả',
        addedByUserId: data.video.addedByUserId || ws.userId || null,
        addedByClientId: data.video.addedByClientId || null,
        startedByUserId: data.video.startedByUserId || ws.userId || null,
        startedByClientId: data.video.startedByClientId || null,
        ambilight: data.video.ambilight || ['#3B82F6', '#8B5CF6'],
        isPlaying: true,
        startTime: Date.now() - (data.currentTime ? data.currentTime * 1000 : 0)
      };
      roomState.skipVotes.clear();
      broadcast({
        type: 'LOAD_VIDEO',
        video: roomState.currentVideo,
        currentTime: data.currentTime || 0
      }, ws);
      break;
    }

    case 'QUEUE_ADVANCE': {
      if (data.nextVideo && data.nextVideo.videoId) {
        roomState.currentVideo = {
          videoId: data.nextVideo.videoId,
          title: data.nextVideo.title,
          channel: data.nextVideo.channel || 'YouTube Cinema',
          startedBy: data.nextVideo.addedBy || 'Khán giả',
          addedByUserId: data.nextVideo.addedByUserId || null,
          addedByClientId: data.nextVideo.addedByClientId || null,
          startedByUserId: data.nextVideo.startedByUserId || null,
          startedByClientId: data.nextVideo.startedByClientId || null,
          ambilight: data.nextVideo.ambilight || ['#3B82F6', '#8B5CF6'],
          isPlaying: true,
          startTime: Date.now()
        };
        if (Array.isArray(data.queue)) {
          roomState.queue = data.queue;
        }
        roomState.skipVotes.clear();
        broadcast({
          type: 'QUEUE_ADVANCE',
          currentVideo: roomState.currentVideo,
          queue: roomState.queue,
          reason: data.reason
        }, ws);
      } else if (data.nextVideo === null || (Array.isArray(data.queue) && data.queue.length === 0)) {
        roomState.currentVideo = null;
        if (Array.isArray(data.queue)) {
          roomState.queue = data.queue;
        }
        roomState.skipVotes.clear();
        broadcast({
          type: 'QUEUE_ADVANCE',
          currentVideo: null,
          nextVideo: null,
          queue: roomState.queue,
          reason: data.reason || 'Hàng đợi đã hết bài hát'
        }, ws);
      }
      break;
    }

    case 'UNAVAILABLE_VIDEO_PURGE': {
      const vidId = data.videoId;
      if (vidId) {
        roomState.queue = roomState.queue.filter((q) => q.videoId !== vidId);
        if (roomState.currentVideo && roomState.currentVideo.videoId === vidId) {
          if (roomState.queue.length > 0) {
            const nextVid = roomState.queue.shift();
            roomState.currentVideo = {
              videoId: nextVid.videoId,
              title: nextVid.title,
              channel: nextVid.channel || 'YouTube Cinema',
              startedBy: nextVid.addedBy || 'Khán giả',
              addedByUserId: nextVid.addedByUserId || null,
              addedByClientId: nextVid.addedByClientId || null,
              startedByUserId: nextVid.startedByUserId || null,
              startedByClientId: nextVid.startedByClientId || null,
              ambilight: nextVid.ambilight || ['#3B82F6', '#8B5CF6'],
              isPlaying: true,
              startTime: Date.now()
            };
          } else {
            roomState.currentVideo = null;
          }
        }
        roomState.skipVotes.clear();
        broadcast({
          type: 'UNAVAILABLE_VIDEO_PURGE',
          videoId: vidId,
          nextVideo: roomState.currentVideo,
          queue: roomState.queue
        }, ws);
      }
      break;
    }

    case 'SYNC_PLAY_PAUSE': {
      const totalOccupants = Object.keys(roomState.occupants).length;
      if (totalOccupants >= 2) {
        // Strictly disallow pause when 2 or more people in theater
        return;
      }
      roomState.currentVideo.isPlaying = !!data.isPlaying;
      broadcast({
        type: 'SYNC_PLAY_PAUSE',
        isPlaying: roomState.currentVideo.isPlaying,
        by: data.by || roomState.occupants[ws.userId]?.name
      }, ws);
      break;
    }

    case 'SYNC_SEEK': {
      const totalOccupants = Object.keys(roomState.occupants).length;
      if (totalOccupants >= 2) {
        // Strictly disallow seek/rewind when 2 or more people in theater
        return;
      }
      if (roomState.currentVideo && typeof data.time === 'number') {
        roomState.currentVideo.startTime = Date.now() - (data.time * 1000);
      }
      broadcast({
        type: 'SYNC_SEEK',
        time: data.time,
        by: data.by || roomState.occupants[ws.userId]?.name
      }, ws);
      break;
    }
  }
}

/**
 * Handle client disconnection: clean up seat and notify other viewers
 */
function handleClientDisconnect(ws) {
  if (!connectedClients.has(ws)) return;
  connectedClients.delete(ws);

  if (ws.userId && roomState.occupants[ws.userId]) {
    const user = roomState.occupants[ws.userId];
    delete roomState.occupants[ws.userId];
    roomState.skipVotes.delete(ws.userId);

    // Broadcast that viewer has left so their 3D chair becomes clean and empty
    broadcast({
      type: 'USER_LEFT',
      userId: ws.userId,
      seat: user.seat,
      remainingCount: Object.keys(roomState.occupants).length
    });

    // Update skip threshold
    const required = getRequiredSkipVotesServer();
    broadcast({
      type: 'SKIP_VOTE_UPDATE',
      votes: Array.from(roomState.skipVotes),
      required
    });
  }
}

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  const netAddrs = getNetworkAddresses();
  console.log('='.repeat(65));
  console.log(`🍿 Hanzu Cinema — Server Real-Time Multi-User Đang Chạy!`);
  console.log(`👉 Truy cập trên máy này:   http://localhost:${PORT}`);
  if (netAddrs.length > 0) {
    console.log(`📱 Mời bạn bè trên cùng Wi-Fi / LAN truy cập các link sau:`);
    netAddrs.forEach((a) => {
      console.log(`   • [${a.name}]: http://${a.address}:${PORT}`);
    });
  }
  console.log('='.repeat(65));
});
