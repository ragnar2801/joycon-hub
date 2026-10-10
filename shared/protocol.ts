export type Controls = { roll: number; pitch: number };
export type InputPacket = Controls & { seq: number; generation: string };
export type Command = 'pause' | 'resume' | 'restart';
export type GameStatus = 'idle' | 'playing' | 'paused' | 'finished';
export type GameFeedback = { status: GameStatus; score: number; rings: number; remaining: number; mode: 'course' | 'practice' };
export type SessionInfo = {
  id: string;
  token: string;
  code: string;
  expiresAt: number;
};
export type SessionState = { hostOnline: boolean; controllerOnline: boolean; ready: boolean };
export type JoinResult = { id: string; controllerKey: string; generation: string };
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
export const neutral: Controls = { roll: 0, pitch: 0 };
export const SESSION_MS = 2 * 60 * 60 * 1000;
export const INVITE_MS = 5 * 60 * 1000;
