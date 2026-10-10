import { useEffect, useRef, useState } from 'react';
import { type Controls, type SessionInfo, type SessionState, type Command, type GameFeedback } from '../shared/protocol';
import { DirectConnection } from './transport';

export const newConnection = (role: 'host' | 'controller') => new DirectConnection(role);
export const request = <T,>(connection: DirectConnection, event: string, data: unknown) => connection.request<T>(event, data);
const empty: SessionState = { hostOnline: false, controllerOnline: false, ready: false };
export function useHost() {
  const connectionRef = useRef<DirectConnection | null>(null);
  const sessionRef = useRef<SessionInfo | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [state, setState] = useState(empty);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<Controls & { at: number }>({ roll: 0, pitch: 0, at: 0 });
  const command = useRef<(c: Command) => void>(() => {});
  useEffect(() => {
    const connection = newConnection('host'); connectionRef.current = connection;
    connection.on('connect', () => { setConnected(true); setError(''); });
    connection.on('disconnect', () => { setConnected(false); if (!sessionRef.current) setState(empty); });
    connection.on('connect_error', () => { setConnected(false); setError('The signaling service is unavailable. Check your internet connection, or explore practice flight.'); });
    connection.on('session:state', (s: SessionState) => { setState(s); if (!s.ready) input.current.at = 0; });
    connection.on('session:revoked', () => { sessionRef.current = null; setSession(null); setState(empty); setError('This session ended. Connect again to get a new QR code.'); });
    connection.on('controller:input', (p: Controls) => { input.current = { roll: p.roll, pitch: p.pitch, at: performance.now() }; });
    connection.on('controller:command', (p: { command: Command }) => command.current(p.command));
    connection.connect();
    return () => { connection.disconnect(); connectionRef.current = null; };
  }, []);
  const pair = async (renew = false) => {
    setError('');
    const connection = connectionRef.current;
    if (!connection) { setError('Signaling is still connecting. Please try again.'); return; }
    try {
      if (!connection.connected) await connection.retry();
      const s = await request<SessionInfo>(connection, sessionRef.current && renew ? 'session:renew' : 'session:create', {});
      sessionRef.current = s; setSession(s);
    } catch (err) { setError((err as Error).message); }
  };
  const feedback = (data: GameFeedback) => connectionRef.current?.send('game:feedback', data);
  return { session, state, connected, error, setError, pair, input, command, feedback };
}
export type Host = ReturnType<typeof useHost>;
export function controllerLink(session: SessionInfo) {
  const root = import.meta.env.VITE_CONTROLLER_URL || `${location.origin}${location.pathname}`;
  return `${root.split('#')[0]}#/controller?session=${encodeURIComponent(session.id)}&token=${encodeURIComponent(session.token)}`;
}
