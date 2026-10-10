import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CircleHelp, Gamepad2, Move, Pause, Plane, Play, Radio, RotateCcw, Settings2, Smartphone, Target, Wifi, WifiOff } from 'lucide-react';
import { newSocket, request, serverUrl } from './connection';
import { MotionController } from './motion';
import { TouchPad } from './TouchPad';
import type { Command, Controls, GameFeedback, JoinResult, SessionState } from '../shared/protocol';

export function Controller() {
  const params = new URLSearchParams(location.hash.split('?')[1]);
  const credentials = useRef<{ id?: string; token?: string; key?: string; generation?: string }>({ id: params.get('session') || undefined, token: params.get('token') || undefined });
  const socket = useRef<ReturnType<typeof newSocket> | null>(null), motion = useRef(new MotionController()), touch = useRef<Controls>({ roll: 0, pitch: 0 });
  const [connected, setConnected] = useState(false), [joined, setJoined] = useState(false), [hostOnline, setHostOnline] = useState(false);
  const [step, setStep] = useState<'join' | 'permission' | 'calibrate' | 'ready'>('join');
  const [controlMode, setControlMode] = useState<'motion' | 'touch'>('motion');
  const [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [settings, setSettings] = useState(false);
  const [sensitivity, setSensitivity] = useState('1'), [invert, setInvert] = useState(false), [visual, setVisual] = useState<Controls>({ roll: 0, pitch: 0 });
  const [game, setGame] = useState<GameFeedback>({ status: 'idle', score: 0, rings: 0, remaining: 90, mode: 'course' });
  const readyRef = useRef(false), modeRef = useRef(controlMode), seq = useRef(0), mounted = useRef(true), wake = useRef<WakeLockSentinel | null>(null);
  modeRef.current = controlMode; motion.current.sensitivity = Number(sensitivity); motion.current.invert = invert;
  const wakeScreen = async () => { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wake.current = await navigator.wakeLock.request('screen'); } catch { /* Wake lock is optional. */ } };
  const unready = (message: string) => {
    readyRef.current = false; touch.current = { roll: 0, pitch: 0 }; setStep('calibrate'); setError(message);
    if (socket.current?.connected) void request(socket.current, 'controller:ready', { ready: false }).catch(() => {});
  };
  const join = async (manualCode?: string) => {
    const client = socket.current;
    if (!client?.connected) { setError('The relay is offline. Check your internet connection and try again.'); return; }
    setBusy(true); setError('');
    try {
      const c = credentials.current;
      const data = await request<JoinResult>(client, 'session:join', manualCode ? { code: manualCode.replace(/\s/g, '').toUpperCase() } : { id: c.id, token: c.token, key: c.key });
      if (!mounted.current) return;
      credentials.current = { id: data.id, key: data.controllerKey, generation: data.generation };
      try { sessionStorage.setItem('joycon-controller', JSON.stringify({ id: data.id, key: data.controllerKey })); } catch { /* Memory credentials still support reconnect. */ }
      // Remove the consumed invitation from the browser's current URL.
      history.replaceState(null, '', `${location.pathname}${location.search}#/controller?session=${data.id}`);
      readyRef.current = false; seq.current = 0; setJoined(true); setStep('permission');
    } catch (err) { setError((err as Error).message); setJoined(false); setStep('join'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    mounted.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem('joycon-controller') || 'null');
      if (saved?.id && saved?.key && (!credentials.current.id || (saved.id === credentials.current.id && !credentials.current.token))) credentials.current = { id: saved.id, key: saved.key };
    } catch { /* No saved controller. */ }
    if (!serverUrl) { setError('Phone pairing has not been configured for this site yet. Ask the host to configure the realtime relay.'); return; }
    const client = newSocket(); socket.current = client;
    client.on('connect', () => { setConnected(true); setError(''); if (credentials.current.token || credentials.current.key) void join(); });
    client.on('disconnect', () => { setConnected(false); readyRef.current = false; setStep('permission'); setHostOnline(false); touch.current = { roll: 0, pitch: 0 }; });
    client.on('connect_error', () => { setConnected(false); setError('Could not reach the pairing relay. Check your internet connection, then try again.'); });
    client.on('session:state', (state: SessionState) => { setHostOnline(state.hostOnline); if (!state.hostOnline && readyRef.current) unready('The game screen disconnected. Wait for it to reconnect, then calibrate again.'); });
    client.on('session:revoked', () => { readyRef.current = false; setJoined(false); setStep('join'); setError('The host ended or reset this connection. Scan the new QR code.'); credentials.current = {}; try { sessionStorage.removeItem('joycon-controller'); } catch { /* No storage access. */ } });
    client.on('game:feedback', setGame);
    motion.current.onRotate = () => { if (readyRef.current) unready('Phone orientation changed. Hold it comfortably and recenter.'); };
    const visibility = () => {
      if (document.hidden && readyRef.current) unready('Welcome back. Recenter your phone before resuming flight.');
      if (!document.hidden && readyRef.current) void wakeScreen();
    };
    document.addEventListener('visibilitychange', visibility);
    let visualTicks = 0;
    const interval = setInterval(() => {
      if (!readyRef.current || !client.connected || document.hidden) return;
      const value = modeRef.current === 'touch' ? touch.current : motion.current.read();
      if (!value) { unready('Motion readings stopped. Recenter, or switch to touch controls.'); return; }
      client.volatile.emit('controller:input', { ...value, seq: seq.current++, generation: credentials.current.generation });
      if (++visualTicks % 3 === 0) setVisual(value);
    }, 33);
    client.connect();
    return () => { mounted.current = false; readyRef.current = false; clearInterval(interval); client.disconnect(); motion.current.stop(); void wake.current?.release(); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  const enable = async () => {
    setBusy(true); setError('');
    try { await motion.current.enable(); if (mounted.current) setStep('calibrate'); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const calibrate = async (useTouch = controlMode === 'touch') => {
    setBusy(true); setError(''); readyRef.current = false;
    try {
      if (socket.current?.connected) await request(socket.current, 'controller:ready', { ready: false });
      if (!useTouch) await motion.current.calibrate();
      if (!mounted.current || !socket.current?.connected) return;
      await request(socket.current, 'controller:ready', { ready: true });
      setStep('ready'); readyRef.current = true; void wakeScreen();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const switchMode = async () => {
    const next = controlMode === 'motion' ? 'touch' : 'motion';
    readyRef.current = false; modeRef.current = next; setControlMode(next); setError(''); motion.current.stop();
    if (next === 'touch') { touch.current = { roll: 0, pitch: 0 }; await calibrate(true); }
    else { setStep('permission'); if (socket.current?.connected) void request(socket.current, 'controller:ready', { ready: false }).catch(() => {}); }
  };
  const command = async (c: Command) => {
    if (!socket.current || !hostOnline) return;
    setBusy(true); setError('');
    const data = { command: c, id: crypto.randomUUID() };
    try {
      try { await request(socket.current, 'controller:command', data); }
      catch { await request(socket.current, 'controller:command', data); }
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return <main className="controller-page"><header className="controller-header"><a className="brand inverse" href="#/"><Gamepad2 size={27}/><span>joycon<span>hub</span></span></a><span className={`controller-status ${connected && joined && hostOnline ? 'online' : ''}`}>{connected && joined && hostOnline ? <Wifi size={14}/> : <WifiOff size={14}/>} {connected && joined && hostOnline ? 'Connected' : 'Waiting'}</span></header>
    <div className="controller-content"><div className="eyebrow">{joined ? 'SKY PILOT · FLIGHT CONTROLLER' : 'WELCOME TO YOUR CONTROLLER'}</div>
      {(!joined || step === 'join') ? <><div className="controller-hero-icon"><Smartphone size={55}/></div><h1>Big moves.<br/>Small screen.</h1><p>Scan the QR code on your game screen,<br/>or enter its six-character pairing code.</p><form className="join-form" onSubmit={e => { e.preventDefault(); void join(code); }}><label htmlFor="pairing-code">PAIRING CODE</label><input id="pairing-code" autoComplete="off" autoCapitalize="characters" maxLength={7} placeholder="ABC 123" value={code} onChange={e => setCode(e.target.value.toUpperCase())}/><button className="button lime" disabled={!connected || busy || code.replace(/\s/g, '').length !== 6}>{busy ? 'Connecting…' : 'Connect to game'}<ArrowRight size={17}/></button></form></> : step === 'permission' ? <><div className="controller-hero-icon"><Radio size={52}/></div><h1>You’re the<br/>flight controls.</h1><p>Hold your phone sideways in both hands.<br/>A little tilt is all it takes.</p><div className="controller-steps"><span><Check size={15}/> Connected to game</span><span><span className="step-dot">2</span> Enable motion sensors</span><span><span className="step-dot">3</span> Find your neutral position</span></div><button className="button lime" disabled={busy || !connected || !hostOnline} onClick={enable}>{busy ? 'Checking motion…' : 'Enable motion'}<ArrowRight size={18}/></button><p className="controller-note">Motion data is used for this session only.<br/>No camera, location, or microphone access.</p><button className="text-button" disabled={busy} onClick={switchMode}><Move size={15}/> Use touch controls instead</button></> : step === 'calibrate' ? <><div className="controller-hero-icon"><Target size={55}/></div><h1>Find your<br/>comfort zone.</h1><p>{controlMode === 'motion' ? 'Hold your phone sideways at a natural angle.\nStay still for a second while we set your center.' : 'Your touch controller is ready.\nTap below to continue.'}</p><button className="button lime" disabled={busy || !hostOnline || !connected} onClick={() => calibrate()}><Target size={18}/>{busy ? 'Hold still…' : controlMode === 'motion' ? 'Calibrate controller' : 'Activate touch controls'}</button><button className="text-button" disabled={busy} onClick={switchMode}>{controlMode === 'motion' ? 'Switch to touch controls' : 'Switch to motion controls'}</button></> : <>
        <div className="controller-ready-heading"><div><h1>Take the skies.</h1><p>{controlMode === 'motion' ? 'Tilt gently. Keep your eyes on the game.' : 'Hold and move the pad to steer.'}</p></div><button className="icon-button" aria-label="Controller settings" onClick={() => setSettings(!settings)}><Settings2 size={21}/></button></div>
        {controlMode === 'motion' ? <div className="motion-instrument"><div className="instrument-ring outer"/><div className="instrument-ring inner"/><span className="instrument-cross horizontal"/><span className="instrument-cross vertical"/><div className="instrument-plane" style={{ transform: `translate(${visual.roll * 40}px, ${-visual.pitch * 40}px) rotate(${visual.roll * 30}deg)` }}><Plane size={78} strokeWidth={1}/></div><span className="instrument-label">{motion.current.source}</span><span className="instrument-live"><i/> LIVE</span></div> : <TouchPad onInput={value => { touch.current = value; }}/>} 
        <div className="controller-readouts"><div><span>ROLL</span><strong>{Math.round(visual.roll * 100)}<small>%</small></strong></div><div><span>PITCH</span><strong>{Math.round(visual.pitch * 100)}<small>%</small></strong></div><div><span>SCORE</span><strong>{game.score}</strong></div></div>
        <button className="button lime" disabled={busy || !hostOnline} onClick={() => command(game.status === 'playing' ? 'pause' : game.status === 'paused' ? 'resume' : 'restart')}>{game.status === 'playing' ? <><Pause size={18}/> Pause flight</> : game.status === 'paused' ? <><Play size={18}/> Resume flight</> : <><Play size={18}/> {game.status === 'finished' ? 'Fly again' : 'Start flight'}</>}</button>
        <div className="controller-secondary"><button disabled={busy} onClick={() => { setStep('calibrate'); void calibrate(); }}><Target size={18}/> Recenter</button><button disabled={busy || !hostOnline} onClick={() => command('restart')}><RotateCcw size={18}/> Restart</button></div>
        {settings && <div className="controller-settings"><label htmlFor="sensitivity">Sensitivity <select id="sensitivity" value={sensitivity} onChange={e => setSensitivity(e.target.value)}><option value="0.65">Gentle</option><option value="1">Balanced</option><option value="1.5">Responsive</option></select></label><label>Invert pitch <input type="checkbox" checked={invert} onChange={e => setInvert(e.target.checked)}/></label><button className="text-button" disabled={busy} onClick={switchMode}>Switch to {controlMode === 'motion' ? 'touch' : 'motion'} controls</button></div>}
        <p className="controller-note">{game.status === 'idle' ? 'Open Sky Pilot on the game screen to start.' : game.mode === 'course' ? `${game.rings} rings · ${game.remaining}s remaining` : 'Free flight · Enjoy the view'}</p>
      </>}
      {error && <p className="controller-error" role="alert">{error}</p>}
      {joined && !hostOnline && <p className="controller-error">The game screen is offline. Keep this page open while it reconnects.</p>}
    </div><footer className="controller-footer"><CircleHelp size={14}/> Keep this page open while playing.</footer>
  </main>;
}
