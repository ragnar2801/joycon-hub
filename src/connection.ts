import { io, type Socket } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';
import { type Controls, type Result, type SessionInfo, type SessionState, type Command, type GameFeedback } from '../shared/protocol';

export const serverUrl = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? `http://${location.hostname}:3001` : '');
export const newSocket = () => io(serverUrl, { autoConnect: false, transports: ['websocket'], reconnectionDelay: 800, reconnectionDelayMax: 4000 });
export function request<T>(socket: Socket, event: string, data: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket.connected) return reject(new Error('Connection unavailable. Please wait for the relay to reconnect.'));
    socket.timeout(5000).emit(event, data, (err: Error | null, result: Result<T>) => {
      if (err) reject(new Error('The connection timed out. Please try again.'));
      else if (!result?.ok) reject(new Error(result?.error || 'Could not complete this action.'));
      else resolve(result.data);
    });
  });
}
const empty: SessionState = { hostOnline: false, controllerOnline: false, ready: false };
export function useHost() {
  const socketRef = useRef<Socket | null>(null);
  const sessionRef = useRef<SessionInfo | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [state, setState] = useState(empty);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<Controls & { at: number }>({ roll: 0, pitch: 0, at: 0 });
  const command = useRef<(c: Command) => void>(() => {});

  useEffect(() => {
    if (!serverUrl) return;
    const socket = newSocket(); socketRef.current = socket;
    const seenCommands = new Set<string>();
    socket.on('connect', async () => {
      setConnected(true); setError('');
      if (sessionRef.current) try {
        await request(socket, 'session:host', { id: sessionRef.current.id, key: sessionRef.current.hostKey });
      } catch (err) { sessionRef.current = null; setSession(null); setError((err as Error).message); }
    });
    socket.on('disconnect', () => { setConnected(false); setState(empty); input.current.at = 0; });
    socket.on('connect_error', () => { setConnected(false); setError('The pairing relay is unavailable. You can still explore practice flight.'); });
    socket.on('session:state', (s: SessionState) => { setState(s); if (!s.ready) input.current.at = 0; });
    socket.on('session:revoked', () => { sessionRef.current = null; setSession(null); setState(empty); setError('This session ended. Connect again to get a new QR code.'); });
    socket.on('controller:input', (p: Controls) => { input.current = { roll: p.roll, pitch: p.pitch, at: performance.now() }; });
    socket.on('controller:command', (p: { id: string; command: Command }, ack?: () => void) => {
      if (!seenCommands.has(p.id)) {
        command.current(p.command); seenCommands.add(p.id);
        if (seenCommands.size > 200) seenCommands.delete(seenCommands.values().next().value!);
      }
      ack?.();
    });
    socket.connect();
    return () => { socket.disconnect(); socketRef.current = null; };
  }, []);
  const pair = async (renew = false) => {
    setError('');
    if (!serverUrl) { setError('Phone pairing needs a realtime relay. Configure VITE_SERVER_URL and redeploy to enable it.'); return; }
    const socket = socketRef.current;
    if (!socket?.connected) { setError('The pairing relay is unavailable. Check that it is running and try again.'); return; }
    try {
      const s = await request<SessionInfo>(socket, sessionRef.current && renew ? 'session:renew' : 'session:create', {});
      sessionRef.current = s; setSession(s);
    } catch (err) { setError((err as Error).message); }
  };
  const feedback = (data: GameFeedback) => { if (socketRef.current?.connected) socketRef.current.volatile.emit('game:feedback', data); };
  return { session, state, connected, error, setError, pair, input, command, feedback };
}
export type Host = ReturnType<typeof useHost>;

export function controllerLink(session: SessionInfo) {
  const root = import.meta.env.VITE_CONTROLLER_URL || `${location.origin}${location.pathname}`;
  return `${root.split('#')[0]}#/controller?session=${encodeURIComponent(session.id)}&token=${encodeURIComponent(session.token)}`;
}
