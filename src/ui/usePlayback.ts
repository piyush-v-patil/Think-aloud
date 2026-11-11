import { useCallback, useEffect, useRef, useState } from 'react';
import { audioSecToSession, sessionToAudioSec } from '../lib/replay/sync';

/**
 * Replay clock. With a recording, the audio element drives time; without
 * one (typed sessions, the demo), a virtual clock plays the code and
 * transcript at real speed.
 */
export function usePlayback(durationMs: number, audio: { url: string; offsetMs: number } | null) {
  const el = useRef<HTMLAudioElement | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  const virtualStart = useRef<{ wall: number; t: number } | null>(null);

  useEffect(() => {
    if (!audio) return;
    const a = new Audio(audio.url);
    a.preload = 'auto';
    el.current = a;
    const onEnd = () => setPlaying(false);
    a.addEventListener('ended', onEnd);
    return () => {
      a.pause();
      a.removeEventListener('ended', onEnd);
      el.current = null;
    };
  }, [audio]);

  useEffect(() => {
    if (!playing) return;
    const loop = () => {
      if (el.current && audio) {
        setT(audioSecToSession(el.current.currentTime, audio.offsetMs));
      } else if (virtualStart.current) {
        const next = virtualStart.current.t + (performance.now() - virtualStart.current.wall);
        if (next >= durationMs) {
          setT(durationMs);
          setPlaying(false);
          return;
        }
        setT(next);
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, audio, durationMs]);

  const seek = useCallback(
    (to: number) => {
      const clamped = Math.max(0, Math.min(durationMs, to));
      setT(clamped);
      if (el.current && audio) el.current.currentTime = sessionToAudioSec(clamped, audio.offsetMs);
      if (virtualStart.current) virtualStart.current = { wall: performance.now(), t: clamped };
    },
    [audio, durationMs],
  );

  const play = useCallback(() => {
    if (el.current && audio) {
      el.current.currentTime = sessionToAudioSec(t, audio.offsetMs);
      void el.current.play();
    } else {
      virtualStart.current = { wall: performance.now(), t: t >= durationMs ? 0 : t };
    }
    setPlaying(true);
  }, [audio, t, durationMs]);

  const pause = useCallback(() => {
    el.current?.pause();
    virtualStart.current = null;
    setPlaying(false);
  }, []);

  return { t, playing, play, pause, seek };
}
