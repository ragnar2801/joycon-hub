import { useState, type PointerEvent } from 'react';
import { Move } from 'lucide-react';
import type { Controls } from '../shared/protocol';

export function TouchPad({ onInput, compact = false }: { onInput: (input: Controls) => void; compact?: boolean }) {
  const [point, setPoint] = useState({ roll: 0, pitch: 0 });
  const update = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const input = { roll: Math.max(-1, Math.min(1, (e.clientX - rect.left) / rect.width * 2 - 1)), pitch: Math.max(-1, Math.min(1, 1 - (e.clientY - rect.top) / rect.height * 2)) };
    setPoint(input); onInput(input);
  };
  const reset = () => { setPoint({ roll: 0, pitch: 0 }); onInput({ roll: 0, pitch: 0 }); };
  return <div className={`touch-pad ${compact ? 'compact' : ''}`} role="group" aria-label="Touch flight controls"
    onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); update(e); }}
    onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) update(e); }}
    onPointerUp={reset} onPointerCancel={reset}>
    <span className="pad-label">CLIMB</span><span className="pad-label bottom">DESCEND</span>
    <span className="pad-axis horizontal"/><span className="pad-axis vertical"/>
    <div className="pad-point" style={{ left: `${50 + point.roll * 38}%`, top: `${50 - point.pitch * 38}%` }}><Move size={20}/></div>
    {!compact && <span className="pad-help">Hold and move to steer</span>}
  </div>;
}
