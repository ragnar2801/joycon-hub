import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, Check, Gamepad2, MoveUpRight, Plane, ScanLine, Smartphone, Sparkles, Target, Wind } from 'lucide-react';
import { useHost } from './connection';
import { PairModal } from './PairModal';
import { Game } from './Game';
import { PlaneArt } from './Art';

export function App() {
  const host = useHost();
  const [page, setPage] = useState<'hub' | 'game'>('hub'), [pairing, setPairing] = useState(false);
  const [best, setBest] = useState(0);
  useEffect(() => { try { setBest(Number(localStorage.getItem('joycon-best') || 0)); } catch { /* Storage optional. */ } }, [page]);
  const pair = () => { setPairing(true); if (!host.session) void host.pair(); };
  const play = () => { setPage('game'); setPairing(false); };
  return <>
    {page === 'game' ? <Game host={host} back={() => setPage('hub')} pair={pair}/> : <div className="hub-shell">
      <header className="hub-header"><a className="brand" href="#/" aria-label="Joycon Hub home"><Gamepad2 size={31} strokeWidth={2}/><span>joycon<span>hub</span></span></a><nav aria-label="Main navigation"><a className="active" href="#games" onClick={e => { e.preventDefault(); document.getElementById('games')?.scrollIntoView({ behavior: 'smooth' }); }}>The games</a><a href="#how-it-works" onClick={e => { e.preventDefault(); document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }); }}>How it works <MoveUpRight size={12}/></a></nav><button className={`button header-connect ${host.state.controllerOnline ? 'connected' : ''}`} onClick={pair}>{host.state.controllerOnline ? <Check size={17}/> : <Smartphone size={17}/>} {host.state.ready ? 'Controller ready' : host.state.controllerOnline ? 'Phone connected' : 'Connect phone'}<span className="status-dot"/></button></header>
      <main className="hub-main"><section className="hero"><div><div className="eyebrow"><span className="tiny-star">✳</span> A NEW WAY TO PLAY</div><h1>Small games.<br/>Big <span className="move-word">moves<svg viewBox="0 0 300 20" aria-hidden="true"><path d="M3 12c86-12 185-12 292-5M32 18c80-8 164-9 243-7" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round"/></svg></span>.</h1><p>Turn your phone into a controller.<br/>Pick a game, scan a code, and let your moves do the rest.</p></div><div className="hero-note"><div className="phone-sketch"><Smartphone size={68} strokeWidth={1.25}/><span className="phone-arrow left">↶</span><span className="phone-arrow right">↷</span><span className="phone-screen-icon"><Gamepad2 size={20}/></span></div><span>Your next controller?<br/><strong>Already in your pocket.</strong></span></div></section>
      <section id="games" className="games-section"><div className="section-heading"><h2>The play collection <span>01 / LIVE</span></h2><span><i className="green-dot"/> Made for your moves</span></div>
        <article className="featured-game"><div className="featured-content"><div className="featured-tags"><span><Sparkles size={12}/> FIRST FLIGHT</span><span>3D ARCADE</span></div><span className="game-number">01 —</span><h2>Sky Pilot<span>Find your wings.</span></h2><p>A little tilt. A wide-open sky.<br/>Steer through golden rings and<br/>take the scenic route home.</p><button className="button lime" onClick={play}>Let’s fly <ArrowRight size={19}/></button><div className="game-meta"><span><Smartphone size={14}/> Motion controlled</span><i/><span>1 player</span><i/><span>90 sec</span></div></div><PlaneArt className="featured-art"/><div className="art-caption"><span>↗ TILT TO TAKE FLIGHT</span><div className="art-cross">+</div></div></article>
        <div className="collection-bottom"><div className="next-game"><div className="next-art balance"><Target size={40} strokeWidth={1}/></div><div><span className="eyebrow">COMING NEXT</span><h3>Balance Lab</h3><p>Steady hands. Rolling adventures.</p></div><span className="soon-tag">In the works</span></div><div className="next-game"><div className="next-art rally"><Wind size={40} strokeWidth={1}/></div><div><span className="eyebrow">ON THE HORIZON</span><h3>Pocket Rally</h3><p>Your phone. The open road.</p></div><span className="soon-tag">Coming soon</span></div></div>
        {best > 0 && <div className="personal-best"><Plane size={16}/> Your Sky Pilot best <strong>{best} points</strong></div>}
      </section>
      <section id="how-it-works" className="how-section"><div className="how-title"><span className="eyebrow">LESS SETUP. MORE PLAY.</span><h2>From pocket<br/>to playground.</h2><span className="how-arrow"><ArrowDown size={26}/></span></div><div className="how-step"><span className="step-number">01</span><div className="step-icon"><ScanLine size={25}/></div><h3>Scan & connect.</h3><p>Open a game on your computer.<br/>Scan its QR code with your phone.</p></div><div className="how-step"><span className="step-number">02</span><div className="step-icon"><Smartphone size={25}/></div><h3>Find your center.</h3><p>Enable motion, hold comfortably,<br/>and calibrate with a single tap.</p></div><div className="how-step"><span className="step-number">03</span><div className="step-icon"><Gamepad2 size={25}/></div><h3>Make your move.</h3><p>Tilt to steer. Tap to pause.<br/>The big screen is your playground.</p></div></section>
      <div className="hub-footnote"><span><Check size={14}/> No app to install</span><span><Check size={14}/> No account to create</span><span><Check size={14}/> Just your phone & a browser</span></div>
      </main><footer className="hub-footer"><span className="footer-brand">joycon hub<span> A little more play in your day.</span></span><span>Built for the way you move. <Sparkles size={13}/></span></footer>
    </div>}
    {pairing && <PairModal host={host} close={() => setPairing(false)} play={play}/>}
  </>;
}
