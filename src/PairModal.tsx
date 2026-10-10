import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, RefreshCw, Smartphone, X, ScanLine, ArrowRight } from 'lucide-react';
import { controllerLink, type Host } from './connection';

export function PairModal({ host, close, play }: { host: Host; close: () => void; play: () => void }) {
  const [qr, setQr] = useState(''), [copied, setCopied] = useState(false), [now, setNow] = useState(Date.now());
  const dialog = useRef<HTMLDialogElement>(null);
  const session = host.session;
  const link = session ? controllerLink(session) : '';
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  useEffect(() => { let cancelled = false; setQr(''); if (link) void QRCode.toDataURL(link, { width: 240, margin: 2, color: { dark: '#173f39', light: '#ffffff' } }).then(url => { if (!cancelled) setQr(url); }).catch(() => host.setError('QR generation failed. Use the pairing code instead.')); return () => { cancelled = true; }; }, [link]);
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);
  const expired = session && now > session.expiresAt;
  const local = !!link && /https?:\/\/(localhost|127\.0\.0\.1)/.test(link);
  return <dialog className="pair-dialog" ref={dialog} onCancel={close} onClick={e => { if (e.target === dialog.current) close(); }}>
    <button className="icon-button modal-close" onClick={close} aria-label="Close pairing"><X size={20}/></button>
    <div className="eyebrow"><ScanLine size={15}/> YOUR PHONE IS THE CONTROLLER</div>
    <h2>Ready to make<br/>your move?</h2><p className="muted">Scan this code with your phone’s camera.<br/>No downloads. Just a little tilt.</p>
    {host.state.controllerOnline ? <div className="paired-state"><div className="success-icon"><Check size={34}/></div><h3>{host.state.ready ? 'Cleared for takeoff.' : 'Phone connected.'}</h3><p>{host.state.ready ? 'Your controller is calibrated and ready.' : 'Enable motion and calibrate on your phone.'}</p><button className="button primary" onClick={play} disabled={!host.state.ready}>Let’s fly <ArrowRight size={17}/></button></div> : <>
      <div className={`qr-frame ${expired ? 'expired' : ''}`}>{qr && !expired ? <img src={qr} alt="Scan to connect your phone to Joycon Hub"/> : <div className="qr-placeholder"><Smartphone size={42}/><span>{expired ? 'This code has expired' : host.error ? 'Pairing unavailable' : 'Preparing your connection…'}</span></div>}</div>
      {session && !expired && <><div className="pair-code"><span>OR ENTER CODE</span><strong>{session.code.slice(0, 3)} {session.code.slice(3)}</strong></div><p className="tiny muted">Expires in {Math.max(0, Math.ceil((session.expiresAt - now) / 60000))} min · One phone per session</p></>}
      {expired && <button className="button primary" onClick={() => host.pair(true)}><RefreshCw size={16}/> Get a fresh code</button>}
    </>}
    {host.error && <p className="notice" role="alert">{host.error}</p>}
    {local && !host.state.controllerOnline && <p className="notice">For phone testing, use the published HTTPS site on both devices. Localhost QR links only work on this computer.</p>}
    <div className="pair-actions">{link && !expired && !host.state.controllerOnline && <button className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { host.setError('Clipboard access is unavailable. Enter the pairing code on the controller page.'); } }}><Copy size={14}/>{copied ? 'Copied!' : 'Copy controller link'}</button>}
    <button className="text-button" onClick={() => host.pair(!!session)}><RefreshCw size={14}/>{session ? 'Reset connection' : 'Try again'}</button></div>
  </dialog>;
}
