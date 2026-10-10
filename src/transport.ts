import Peer, { type DataConnection } from 'peerjs';
import { INVITE_MS, SESSION_MS, type InputPacket, type JoinResult, type SessionInfo, type SessionState } from '../shared/protocol';

type Handler = (...args: any[]) => void;
type Envelope = { kind: 'request' | 'response' | 'event'; event: string; id?: string; data?: any; error?: string };
type HostSession = SessionInfo & { createdAt: number; controllerKey?: string; generation?: string; ready: boolean; seq: number };
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), n => alphabet[n % alphabet.length]).join('');
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
const validPeer = (id: unknown): id is string => typeof id === 'string' && /^jch-[A-HJ-NP-Z2-9]{6}$/.test(id);

/** PeerServer handles signaling; application messages travel over encrypted WebRTC. */
export class DirectConnection {
  connected = false;
  private peer: Peer | null = null;
  private control: DataConnection | null = null;
  private fast: RTCDataChannel | null = null;
  private session: HostSession | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: number }>();
  private stopped = false;
  private reconnectTimer = 0;
  private heartbeatTimer = 0;
  private lastSeen = 0;
  private lastInputAt = 0;
  private attempts: number[] = [];
  private messageTimes: number[] = [];
  private receivedCommands = new Set<string>();
  private joining: Promise<JoinResult> | null = null;
  constructor(private role: 'host' | 'controller') {}
  async retry() {
    this.stopped = true; clearTimeout(this.reconnectTimer);
    if (this.session) { this.endSession(); this.fire('session:revoked'); }
    const old = this.control; this.control = null; this.fast?.close(); this.fast = null; old?.close();
    this.peer?.destroy(); this.rejectPending('Connection restarted.'); this.connected = false;
    this.stopped = false; await this.register();
  }
  on(event: string, handler: Handler) { if (!this.handlers.has(event)) this.handlers.set(event, new Set()); this.handlers.get(event)!.add(handler); return this; }
  private fire(event: string, ...args: any[]) { this.handlers.get(event)?.forEach(handler => handler(...args)); }
  private options() {
    return {
      secure: true,
      ...(import.meta.env.VITE_SIGNAL_HOST ? { host: import.meta.env.VITE_SIGNAL_HOST, port: Number(import.meta.env.VITE_SIGNAL_PORT || 443), path: import.meta.env.VITE_SIGNAL_PATH || '/' } : {}),
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
      debug: 0,
    };
  }
  connect() {
    this.stopped = false;
    void this.register().catch(error => this.fire('connect_error', error));
    this.heartbeatTimer = window.setInterval(() => {
      if (this.session && Date.now() - this.session.createdAt > SESSION_MS) { this.endSession(); this.fire('session:revoked'); }
      if (!this.control?.open) return;
      if (performance.now() - this.lastSeen > 9000) { this.control.close(); return; }
      this.write({ kind: 'event', event: 'heartbeat' });
    }, 2000);
  }
  private register(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.stopped) { reject(new Error('Connection closed.')); return; }
      const id = this.role === 'host' ? `jch-${randomCode()}` : `jch-phone-${crypto.randomUUID()}`;
      const peer = new Peer(id, this.options()); this.peer = peer;
      const timeout = window.setTimeout(() => { reject(new Error('Signaling could not connect. Check your internet connection.')); this.fire('connect_error'); }, 12000);
      peer.on('open', () => {
        clearTimeout(timeout); if (this.stopped || this.peer !== peer) return;
        const wasConnected = this.connected; this.connected = true;
        if (!wasConnected) this.fire('connect'); resolve();
      });
      peer.on('connection', connection => { if (this.role !== 'host') connection.close(); else this.accept(connection); });
      peer.on('error', error => {
        if (this.peer !== peer || this.stopped) return;
        if (error.type === 'unavailable-id' && this.role === 'host') { clearTimeout(timeout); peer.destroy(); void this.register().then(resolve, reject); return; }
        if (error.type === 'peer-unavailable') { this.rejectPending('The game screen could not be found. Scan a fresh QR code.'); this.control?.close(); }
        else if (!this.control?.open) { this.connected = false; this.fire('connect_error', error); }
        clearTimeout(timeout); reject(new Error(error.message));
      });
      peer.on('disconnected', () => {
        if (this.stopped || this.peer !== peer) return;
        // Existing direct connections survive a lost signaling socket.
        if (!this.control?.open) { this.connected = false; this.fire('disconnect'); }
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => { if (!this.stopped && this.peer === peer && !peer.destroyed) peer.reconnect(); }, 1800);
      });
    });
  }
  async request<T>(event: string, data: any): Promise<T> {
    if (!this.connected) throw new Error('Waiting for signaling to reconnect. Check your internet connection.');
    if (this.role === 'host') {
      if (event === 'session:create' || event === 'session:renew') {
        if (this.session) { this.endSession(); this.peer?.destroy(); this.peer = null; this.connected = false; await this.register(); }
        if (!this.peer?.id) throw new Error('Signaling is still connecting. Try again.');
        const now = Date.now();
        this.session = { id: this.peer.id, code: this.peer.id.slice(4), token: secret(), expiresAt: now + INVITE_MS, createdAt: now, ready: false, seq: -1 };
        this.notify();
        const { id, code, token, expiresAt } = this.session;
        return { id, code, token, expiresAt } as T;
      }
      if (event === 'session:close') { this.endSession(); return undefined as T; }
      throw new Error('Unknown host action.');
    }
    if (event === 'session:join') {
      if (this.joining) return this.joining as Promise<T>;
      this.joining = this.join(data);
      try { return await this.joining as T; } finally { this.joining = null; }
    }
    return this.remote<T>(event, data);
  }
  private async join(data: any): Promise<JoinResult> {
    const id = data.code ? `jch-${String(data.code).toUpperCase()}` : data.id;
    if (!validPeer(id)) throw new Error('Invalid pairing code. Scan the latest QR code or enter all six characters.');
    if (!this.peer || this.peer.disconnected) throw new Error('Signaling is reconnecting. Please try again.');
    const old = this.control; this.control = null; old?.close(); this.fast?.close(); this.fast = null;
    const connection = this.peer.connect(id, { label: 'joycon-control', serialization: 'json', reliable: true });
    this.control = connection;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { if (this.control === connection) this.control = null; connection.close(); reject(new Error('Direct connection timed out. Use the same Wi-Fi and avoid guest networks that isolate devices.')); }, 15000);
      this.bind(connection);
      connection.on('open', () => { clearTimeout(timer); this.prepareFastChannel(connection, false); resolve(); });
      connection.on('error', () => { clearTimeout(timer); reject(new Error('Could not establish direct WebRTC. Check both devices are on the same Wi-Fi.')); });
      connection.on('close', () => { clearTimeout(timer); reject(new Error('The game screen closed the connection. Try a new QR code.')); });
    });
    return this.remote<JoinResult>('session:join', data);
  }
  private accept(connection: DataConnection) {
    const now = Date.now(); this.attempts = this.attempts.filter(at => now - at < 60000);
    if (!this.session || connection.label !== 'joycon-control' || this.attempts.length >= 16) { connection.on('open', () => connection.close()); return; }
    this.attempts.push(now);
    const timer = window.setTimeout(() => { if (connection !== this.control) connection.close(); }, 8000);
    connection.on('open', () => { connection.peerConnection.ondatachannel = null; });
    connection.on('data', raw => {
      if (connection === this.control) return;
      const message = this.parse(raw);
      if (!message || message.kind !== 'request' || message.event !== 'session:join' || !message.id) { connection.close(); return; }
      clearTimeout(timer);
      const s = this.session, p = message.data;
      const reject = (error: string) => { connection.send({ kind: 'response', event: message.event, id: message.id, error }); setTimeout(() => connection.close(), 100); };
      if (!s || !p) return reject('Invitation unavailable. Scan a fresh QR code.');
      const reconnect = typeof p.key === 'string' && p.key === s.controllerKey;
      const invite = typeof p.token === 'string' && p.token === s.token;
      const backup = typeof p.code === 'string' && p.code.toUpperCase() === s.code;
      if (!reconnect && (!invite && !backup)) return reject('Invalid invitation.');
      if (!reconnect && (Date.now() > s.expiresAt || s.controllerKey)) return reject('Invitation expired or used. Ask for a new QR code.');
      if (this.control?.open) return reject('A phone is already connected. Reset the connection to pair another.');
      this.control = connection; s.controllerKey ||= secret(); s.generation = secret(); s.seq = -1; s.ready = false;
      this.lastSeen = performance.now(); this.receivedCommands.clear();
      connection.send({ kind: 'response', event: 'session:join', id: message.id, data: { id: s.id, controllerKey: s.controllerKey, generation: s.generation } });
      this.bind(connection); this.prepareFastChannel(connection, true); this.notify();
    });
    connection.on('close', () => clearTimeout(timer)); connection.on('error', () => clearTimeout(timer));
  }
  private prepareFastChannel(connection: DataConnection, host: boolean) {
    const pc = connection.peerConnection;
    // PeerJS has installed the first channel. Additional channels are owned here.
    pc.ondatachannel = null;
    const bind = (channel: RTCDataChannel) => {
      if (channel.label !== 'joycon-motion') { channel.close(); return; }
      this.fast?.close(); this.fast = channel;
      if (host) channel.onmessage = event => {
        if (connection !== this.control || typeof event.data !== 'string' || event.data.length > 512) return;
        try { this.acceptInput(JSON.parse(event.data)); } catch { /* Malformed motion packets are dropped. */ }
      };
    };
    if (host) bind(pc.createDataChannel('joycon-motion', { ordered: false, maxRetransmits: 0 }));
    else pc.addEventListener('datachannel', event => bind(event.channel));
  }
  private bind(connection: DataConnection) {
    this.lastSeen = performance.now();
    connection.on('data', raw => { if (this.control === connection) this.read(raw); });
    connection.on('close', () => {
      if (this.control !== connection) return;
      this.control = null; this.fast?.close(); this.fast = null; this.rejectPending('Direct connection lost.');
      if (this.role === 'host') { if (this.session) this.session.ready = false; this.notify(); }
      else {
        this.fire('session:state', { hostOnline: false, controllerOnline: false, ready: false });
        this.connected = false; this.fire('disconnect');
        if (!this.stopped) this.reconnectTimer = window.setTimeout(() => { if (this.peer && !this.peer.disconnected && !this.stopped) { this.connected = true; this.fire('connect'); } }, 1800);
      }
    });
    connection.on('error', () => { if (this.control === connection) connection.close(); });
  }
  private remote<T>(event: string, data: any): Promise<T> {
    if (!this.control?.open) return Promise.reject(new Error('The direct connection is not ready. Reconnect your phone.'));
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = window.setTimeout(() => { this.pending.delete(id); reject(new Error('The game screen did not respond. Please try again.')); }, 4500);
      this.pending.set(id, { resolve, reject, timer }); this.write({ kind: 'request', event, id, data });
    });
  }
  private parse(raw: unknown): Envelope | null {
    if (!raw || typeof raw !== 'object' || JSON.stringify(raw).length > 4096) return null;
    const p = raw as Envelope;
    return ['request', 'response', 'event'].includes(p.kind) && typeof p.event === 'string' && p.event.length < 80 ? p : null;
  }
  private read(raw: unknown) {
    const message = this.parse(raw); if (!message) return;
    this.lastSeen = performance.now();
    if (message.kind === 'response' && message.id) {
      const pending = this.pending.get(message.id); if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error)); else pending.resolve(message.data); return;
    }
    if (message.kind === 'event') {
      if (message.event === 'heartbeat') { this.write({ kind: 'event', event: 'heartbeat:reply' }); return; }
      if (message.event === 'heartbeat:reply') return;
      if (this.role === 'host') { if (message.event === 'controller:input') this.acceptInput(message.data); }
      else if (['session:state', 'session:revoked', 'game:feedback'].includes(message.event)) this.fire(message.event, message.data);
      return;
    }
    if (this.role !== 'host' || message.kind !== 'request' || !message.id || !this.session) return;
    const s = this.session, data = message.data;
    const now = performance.now(); this.messageTimes = this.messageTimes.filter(at => now - at < 1000);
    const answer = (error?: string) => this.write({ kind: 'response', event: message.event, id: message.id, error });
    if (this.messageTimes.length > 40) { answer('Too many controller requests.'); return; } this.messageTimes.push(now);
    if (message.event === 'controller:ready' && typeof data?.ready === 'boolean') { s.ready = data.ready; this.notify(); answer(); }
    else if (message.event === 'controller:command' && typeof data?.id === 'string' && data.id.length < 80 && ['pause', 'resume', 'restart'].includes(data.command)) {
      if (!s.ready && data.command !== 'pause') { answer('Calibrate before continuing.'); return; }
      if (!this.receivedCommands.has(data.id)) {
        this.receivedCommands.add(data.id); if (this.receivedCommands.size > 200) this.receivedCommands.delete(this.receivedCommands.values().next().value!);
        this.fire('controller:command', data);
      }
      answer();
    } else answer('Unknown controller request.');
  }
  private acceptInput(p: InputPacket) {
    const s = this.session;
    if (!s?.ready || !p || p.generation !== s.generation || !Number.isSafeInteger(p.seq) || p.seq <= s.seq || !Number.isFinite(p.roll) || !Number.isFinite(p.pitch) || Math.abs(p.roll) > 1 || Math.abs(p.pitch) > 1) return;
    const now = performance.now();
    if (now - this.lastInputAt < 12) return;
    this.lastInputAt = now; s.seq = p.seq; this.lastSeen = now; this.fire('controller:input', { roll: p.roll, pitch: p.pitch });
  }
  send(event: string, data: unknown) {
    if (!this.control?.open) return;
    if (event === 'controller:input' && this.role === 'controller') {
      if (this.fast?.readyState === 'open') { if (this.fast.bufferedAmount < 2048) this.fast.send(JSON.stringify(data)); return; }
      if (this.control.dataChannel.bufferedAmount < 2048) this.write({ kind: 'event', event, data });
    } else if (event === 'game:feedback' && this.role === 'host' && this.control.dataChannel.bufferedAmount < 4096) this.write({ kind: 'event', event, data });
  }
  private write(message: Envelope) { if (this.control?.open) this.control.send(message); }
  private notify() {
    const state: SessionState = { hostOnline: true, controllerOnline: !!this.control?.open, ready: !!this.session?.ready };
    this.fire('session:state', state); this.write({ kind: 'event', event: 'session:state', data: state });
  }
  private rejectPending(message: string) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(message)); } this.pending.clear(); }
  private endSession() {
    this.write({ kind: 'event', event: 'session:revoked' });
    const connection = this.control; this.control = null; this.fast?.close(); this.fast = null;
    if (connection) setTimeout(() => connection.close(), 100);
    this.session = null; this.notify();
  }
  disconnect() {
    this.stopped = true; clearInterval(this.heartbeatTimer); clearTimeout(this.reconnectTimer);
    this.fast?.close(); this.control?.close(); this.peer?.destroy(); this.rejectPending('Connection closed.'); this.connected = false;
  }
}
