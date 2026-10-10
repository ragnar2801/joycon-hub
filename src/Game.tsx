import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw, Smartphone, Trophy, Wind, Target, Timer, Signal, X } from 'lucide-react';
import { createFlight, type Flight, type FlightSnapshot } from './flight';
import type { Host } from './connection';
import type { Controls } from '../shared/protocol';
import { TouchPad } from './TouchPad';

const initial: FlightSnapshot = { status: 'idle', mode: 'course', score: 0, rings: 0, remaining: 90, speed: 0, altitude: 28, missed: 0, message: '' };
export function Game({ host, back, pair }: { host: Host; back: () => void; pair: () => void }) {
  const container = useRef<HTMLDivElement>(null), engine = useRef<Flight | null>(null), touch = useRef<Controls>({ roll: 0, pitch: 0 });
  const [hud, setHud] = useState(initial), [error, setError] = useState(''), [demo, setDemo] = useState(false), [reason, setReason] = useState('');
  const demoRef = useRef(demo), stateRef = useRef(host.state), feedback = useRef(host.feedback);
  demoRef.current = demo; stateRef.current = host.state; feedback.current = host.feedback;
  const [mode, setMode] = useState<'course' | 'practice'>('course');
  const modeRef = useRef(mode); modeRef.current = mode;
  useEffect(() => {
    if (hud.status === 'finished') try {
      const best = Number(localStorage.getItem('joycon-best') || 0);
      if (hud.score > best) localStorage.setItem('joycon-best', String(hud.score));
    } catch { /* Scores are optional when browser storage is disabled. */ }
  }, [hud.status, hud.score]);
  useEffect(() => {
    if (!container.current) return;
    let lastFeedback = 0;
    engine.current = createFlight(container.current, s => { setHud(s); if (performance.now() - lastFeedback > 400) { lastFeedback = performance.now(); feedback.current(s); } }, setError);
    let frame = 0;
    const update = () => {
      const game = engine.current;
      const input = host.input.current;
      const age = performance.now() - input.at;
      game?.input(demoRef.current ? touch.current : age < 250 ? input : { roll: 0, pitch: 0 });
      if (!demoRef.current && game?.status() === 'playing' && (!stateRef.current.ready || age > 1000)) { game.pause(); setReason('Your controller stopped sending input. Reconnect or recenter on your phone, then resume.'); }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    const hidden = () => { if (document.hidden) { engine.current?.pause(); setReason('Flight paused while this tab was in the background.'); touch.current = { roll: 0, pitch: 0 }; } };
    const blur = () => { engine.current?.pause(); touch.current = { roll: 0, pitch: 0 }; };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('blur', blur);
    host.command.current = command => {
      if (command === 'pause') gamePause();
      else if (!demoRef.current && stateRef.current.ready) { setReason(''); if (command === 'resume') engine.current?.resume(); else engine.current?.start(modeRef.current); }
    };
    function gamePause() { engine.current?.pause(); setReason('Paused from your phone.'); }
    return () => { cancelAnimationFrame(frame); engine.current?.dispose(); engine.current = null; document.removeEventListener('visibilitychange', hidden); window.removeEventListener('blur', blur); host.command.current = () => {}; feedback.current({ ...initial, status: 'idle' }); };
  }, []);
  const start = (useTouch: boolean) => { setDemo(useTouch); demoRef.current = useTouch; setReason(''); engine.current?.start(mode); };
  const canResume = demo || (host.state.ready && performance.now() - host.input.current.at < 1000);
  return <div className="game-screen">
    <div ref={container} className="flight-canvas"/>
    <div className="game-top"><button className="glass-button" onClick={back}><ArrowLeft size={17}/> Hub</button><span className="game-wordmark">sky pilot<span>BY JOYCON HUB</span></span><div className="game-top-right"><span className={`connection-chip ${host.state.ready ? 'online' : ''}`}><Signal size={14}/>{demo ? 'Practice pad' : host.state.ready ? 'Phone connected' : 'Phone needed'}</span><button className="glass-button icon-only" aria-label="Pause flight" disabled={hud.status !== 'playing'} onClick={() => { engine.current?.pause(); setReason('Take a breather.'); }}><Pause size={18}/></button></div></div>
    {hud.status === 'playing' && <><div className="flight-hud"><div><Target size={18}/><strong>{hud.rings}<small> / {hud.mode === 'course' ? '12' : '∞'}</small></strong><span>RINGS</span></div><div><Trophy size={18}/><strong>{hud.score}</strong><span>SCORE</span></div><div><Timer size={18}/><strong>{hud.mode === 'course' ? `${Math.floor(hud.remaining / 60)}:${String(hud.remaining % 60).padStart(2, '0')}` : '∞'}</strong><span>TIME LEFT</span></div></div><div className="flight-reticle"><span/><span/></div><div className="flight-bottom"><span><Wind size={16}/> {hud.speed} km/h <i/> {hud.altitude} m altitude</span><span>Tilt. Turn. Find your flow.</span></div>{hud.message && <div className="flight-message" role="status">{hud.message}</div>}{demo && <div className="demo-controls"><TouchPad compact onInput={value => { touch.current = value; }}/><span>Drag to steer · Release to level</span></div>}</>}
    {(hud.status !== 'playing' || error) && <div className="game-overlay"><div className="launch-panel">
      {error ? <><h1>Flight unavailable</h1><p>{error}</p><button className="button primary" onClick={back}>Back to hub</button></> : hud.status === 'idle' ? <>
        <span className="eyebrow"><Wind size={15}/> YOUR NEXT LITTLE ADVENTURE</span><h1>Let’s take<br/>the scenic route.</h1><p>Bank through the clouds. Chase the golden rings.<br/>Your phone puts you in the pilot’s seat.</p>
        <div className="mode-select"><button className={mode === 'course' ? 'selected' : ''} onClick={() => setMode('course')}><Target size={17}/> Ring run<small>12 rings · 90 seconds</small></button><button className={mode === 'practice' ? 'selected' : ''} onClick={() => setMode('practice')}><Wind size={17}/> Free flight<small>No timer · Find your wings</small></button></div>
        <button className="button primary launch-button" onClick={() => host.state.ready ? start(false) : pair()}>{host.state.ready ? <><Play size={17}/> Take off</> : <><Smartphone size={17}/> Connect phone to fly</>}<ArrowRight size={17}/></button><button className="text-button" onClick={() => start(true)}>Explore with the practice pad</button><div className="flight-instructions"><span>↔ Tilt to bank</span><span>↕ Tilt to climb</span><span>◎ Recenter anytime</span></div>
      </> : hud.status === 'paused' ? <><span className="eyebrow">A MOMENT ABOVE THE CLOUDS</span><h1>Flight paused.</h1><p>{reason || 'Ready when you are.'}</p><button className="button primary launch-button" disabled={!canResume} onClick={() => { setReason(''); engine.current?.resume(); }}><Play size={16}/> Resume flight</button>{!demo && !host.state.ready && <button className="text-button" onClick={pair}><Smartphone size={16}/> Reconnect phone</button>}<button className="text-button" onClick={() => engine.current?.start()}><RotateCcw size={15}/> Start over</button><button className="text-button" onClick={back}><X size={15}/> Return to hub</button></> : <><div className="result-icon"><Trophy size={32}/></div><span className="eyebrow">A LITTLE FLIGHT. A BIG FINISH.</span><h1>Nice flying.</h1><div className="result-score">{hud.score}<span>POINTS</span></div><p>{hud.rings} rings collected · {hud.missed} missed<br/>Best score is saved on this browser.</p><button className="button primary launch-button" onClick={() => start(demo)}><RotateCcw size={17}/> Fly again</button><button className="text-button" onClick={back}>Back to the hub <ArrowRight size={16}/></button></>}
    </div></div>}
  </div>;
}
