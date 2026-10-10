import { createServer } from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import { INVITE_MS, SESSION_MS, type GameFeedback, type InputPacket, type SessionInfo } from '../shared/protocol.ts';

const production = process.env.NODE_ENV === 'production';
const origins = (process.env.ALLOWED_ORIGINS || (production ? '' : 'http://localhost:5173,http://127.0.0.1:5173')).split(',').map(s => s.trim()).filter(Boolean);
if (production && !origins.length) throw new Error('ALLOWED_ORIGINS must contain the frontend HTTPS origin.');
const allowed = (origin?: string) => !!origin && (origins.includes(origin) || (!production && /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+):5173$/.test(origin)));
const http = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(req.url === '/health' ? 200 : 404);
  res.end(JSON.stringify(req.url === '/health' ? { status: 'ok', service: 'joycon-relay' } : { error: 'Not found' }));
});
const io = new Server(http, {
  cors: { origin: (origin, cb) => cb(null, allowed(origin)) },
  allowRequest: (req, cb) => cb(null, allowed(req.headers.origin)),
  maxHttpBufferSize: 4096,
  pingInterval: 10000,
  pingTimeout: 10000,
});
type Session = SessionInfo & {
  createdAt: number; host?: string; controller?: string; controllerKey?: string;
  generation?: string; ready: boolean; seq: number; lastInput: number; commands: Set<string>;
};
const sessions = new Map<string, Session>();
const budgets = new Map<string, { count: number; until: number }>();
const secret = () => randomBytes(32).toString('base64url');
const fail = (ack: unknown, error: string) => { if (typeof ack === 'function') ack({ ok: false, error }); };
const ok = (ack: unknown, data?: unknown) => { if (typeof ack === 'function') ack({ ok: true, data }); };
const budget = (key: string, limit: number, window = 60000) => {
  const now = Date.now();
  const bucket = budgets.get(key);
  if (!bucket || bucket.until < now) { budgets.set(key, { count: 1, until: now + window }); return true; }
  return ++bucket.count <= limit;
};
const notify = (s: Session) => io.to(s.id).emit('session:state', { hostOnline: !!s.host, controllerOnline: !!s.controller, ready: s.ready });
const code = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value: string;
  do { value = Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join(''); } while ([...sessions.values()].some(s => s.code === value));
  return value;
};
function own(socket: Socket, role: 'host' | 'controller') {
  const s = sessions.get(socket.data.session);
  return s && s[role] === socket.id ? s : undefined;
}
function leave(socket: Socket) {
  const s = sessions.get(socket.data.session);
  if (s) {
    if (s.host === socket.id) s.host = undefined;
    if (s.controller === socket.id) { s.controller = undefined; s.ready = false; }
    void socket.leave(s.id);
    notify(s);
  }
  socket.data.session = undefined;
}
function attach(socket: Socket, s: Session) { socket.data.session = s.id; void socket.join(s.id); }

io.on('connection', socket => {
  // Socket.IO uses the direct peer address. Do not trust arbitrary forwarded headers.
  const ip = socket.handshake.address;
  if (!budget(`connection:${ip}`, 120)) return socket.disconnect(true);

  socket.on('session:create', (_: unknown, ack: unknown) => {
    if (!budget(`create:${ip}`, 10) || sessions.size >= 1000) return fail(ack, 'Too many sessions. Please try again shortly.');
    leave(socket);
    const now = Date.now();
    const s: Session = { id: randomBytes(16).toString('hex'), token: secret(), hostKey: secret(), code: code(), expiresAt: now + INVITE_MS, createdAt: now, host: socket.id, ready: false, seq: -1, lastInput: 0, commands: new Set() };
    sessions.set(s.id, s); attach(socket, s);
    ok(ack, { id: s.id, token: s.token, code: s.code, expiresAt: s.expiresAt, hostKey: s.hostKey }); notify(s);
  });
  socket.on('session:host', (p, ack) => {
    if (!budget(`host:${ip}`, 30)) return fail(ack, 'Please wait before reconnecting.');
    const s = sessions.get(p?.id);
    if (!s || !p?.key || s.hostKey !== p.key) return fail(ack, 'Session expired. Create a new connection.');
    if (s.host && s.host !== socket.id) return fail(ack, 'This session is open in another window.');
    leave(socket); s.host = socket.id; attach(socket, s); ok(ack); notify(s);
  });
  socket.on('session:join', (p, ack) => {
    if (!budget(`join:${ip}`, 20)) return fail(ack, 'Too many pairing attempts. Try again in a minute.');
    if (typeof p !== 'object' || !p) return fail(ack, 'Invalid invitation.');
    const s = p.id ? sessions.get(p.id) : [...sessions.values()].find(s => typeof p.code === 'string' && s.code === p.code.toUpperCase());
    const reconnect = s && typeof p.key === 'string' && p.key === s.controllerKey;
    if (!s || (!reconnect && (!(typeof p.token === 'string' && p.token === s.token) && !(typeof p.code === 'string' && p.code.toUpperCase() === s.code)))) return fail(ack, 'Invalid pairing code or invitation.');
    if (!reconnect && (s.expiresAt < Date.now() || s.controllerKey)) return fail(ack, 'Invitation expired or already used. Ask for a new QR code.');
    if (s.controller && s.controller !== socket.id) return fail(ack, 'A phone is already connected to this session.');
    if (!s.host) return fail(ack, 'The game screen is offline. Reopen Joycon Hub first.');
    leave(socket);
    s.controller = socket.id; s.controllerKey ||= secret(); s.generation = randomBytes(12).toString('hex'); s.seq = -1; s.ready = false; s.commands.clear();
    attach(socket, s);
    ok(ack, { id: s.id, controllerKey: s.controllerKey, generation: s.generation }); notify(s);
  });
  socket.on('session:renew', (_: unknown, ack: unknown) => {
    const s = own(socket, 'host');
    if (!s || !budget(`renew:${ip}`, 10)) return fail(ack, 'Could not renew this session.');
    if (s.controller) {
      const phone = io.sockets.sockets.get(s.controller);
      phone?.emit('session:revoked');
      if (phone) leave(phone);
    }
    s.controllerKey = undefined; s.token = secret(); s.code = code(); s.expiresAt = Date.now() + INVITE_MS; s.ready = false;
    ok(ack, { id: s.id, token: s.token, code: s.code, expiresAt: s.expiresAt, hostKey: s.hostKey }); notify(s);
  });
  socket.on('controller:ready', (p, ack) => {
    const s = own(socket, 'controller');
    if (!s || typeof p?.ready !== 'boolean' || !budget(`ready:${socket.id}`, 30)) return fail(ack, 'Controller unavailable.');
    s.ready = p.ready; notify(s); ok(ack);
  });
  socket.on('controller:input', (p: InputPacket) => {
    const s = own(socket, 'controller');
    if (!s?.ready || !p || p.generation !== s.generation || !Number.isSafeInteger(p.seq) || p.seq <= s.seq || !Number.isFinite(p.roll) || !Number.isFinite(p.pitch) || Math.abs(p.roll) > 1 || Math.abs(p.pitch) > 1) return;
    const now = Date.now();
    if (now - s.lastInput < 12) return;
    s.lastInput = now; s.seq = p.seq;
    if (s.host) io.to(s.host).volatile.emit('controller:input', { roll: p.roll, pitch: p.pitch, seq: p.seq });
  });
  socket.on('controller:command', (p, ack) => {
    const s = own(socket, 'controller');
    if (!s || !s.host || !budget(`command:${socket.id}`, 30, 1000) || typeof p?.id !== 'string' || p.id.length > 80 || !['pause', 'resume', 'restart'].includes(p?.command)) return fail(ack, 'Command unavailable.');
    if (s.commands.has(p.id)) return ok(ack);
    if (!s.ready && p.command !== 'pause') return fail(ack, 'Calibrate before continuing.');
    io.to(s.host).timeout(2000).emit('controller:command', { id: p.id, command: p.command }, (err: Error | null) => {
      if (err) return fail(ack, 'The game screen did not respond. Try again.');
      s.commands.add(p.id); if (s.commands.size > 100) s.commands.delete(s.commands.values().next().value!); ok(ack);
    });
  });
  socket.on('game:feedback', (p: GameFeedback) => {
    const s = own(socket, 'host');
    if (!s?.controller || !budget(`feedback:${socket.id}`, 10, 1000) || !p || !['idle', 'playing', 'paused', 'finished'].includes(p.status) || !['course', 'practice'].includes(p.mode) || ![p.score, p.rings, p.remaining].every(n => Number.isFinite(n) && n >= 0 && n < 1000000)) return;
    io.to(s.controller).volatile.emit('game:feedback', p);
  });
  socket.on('ping:check', (_: unknown, ack: unknown) => { if (budget(`ping:${socket.id}`, 5, 1000)) ok(ack); });
  socket.on('session:close', (_: unknown, ack: unknown) => {
    const s = own(socket, 'host');
    if (!s) return fail(ack, 'Session unavailable.');
    io.to(s.id).emit('session:revoked');
    for (const id of [s.host, s.controller]) { const member = id && io.sockets.sockets.get(id); if (member) leave(member); }
    sessions.delete(s.id); ok(ack);
  });
  socket.on('disconnect', () => leave(socket));
});
setInterval(() => {
  const now = Date.now();
  for (const s of sessions.values()) if (now - s.createdAt > SESSION_MS || (!s.host && !s.controller && now - s.createdAt > 10 * 60 * 1000)) {
    io.to(s.id).emit('session:revoked');
    for (const id of [s.host, s.controller]) { const socket = id && io.sockets.sockets.get(id); if (socket) leave(socket); }
    sessions.delete(s.id);
  }
  for (const [key, bucket] of budgets) if (bucket.until < now) budgets.delete(key);
}, 30000).unref();
const port = Number(process.env.PORT || 3001);
http.listen(port, '0.0.0.0', () => console.log(`Joycon relay listening on port ${port}`));
const shutdown = () => { io.close(); http.close(); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
