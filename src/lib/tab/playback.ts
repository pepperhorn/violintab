// src/lib/tab/playback.ts
import { Soundfont } from "smplr";
import { beatFraction } from "./durations";
import { VIOLIN } from "./instruments";
import { noteToMidi } from "./pitch";
import type { TabDoc } from "./types";

export interface ScheduledBeat {
  atSec: number;
  durSec: number;
  midis: number[];
  globalBeatIndex: number;
}

/** Pure timing math — unit tested. quarter = 60/bpm seconds. Notes whose pitch
 *  can't be resolved (out-of-range finger/position) are silently dropped. */
export function buildSchedule(doc: TabDoc, bpm: number): ScheduledBeat[] {
  const quarterSec = 60 / bpm;
  const sched: ScheduledBeat[] = [];
  let t = 0;
  let globalBeatIndex = 0;
  for (const measure of doc.measures) {
    for (const beat of measure.beats) {
      const durSec = beatFraction(beat.duration, beat.dotted) * 4 * quarterSec;
      const midis = beat.isRest
        ? []
        : beat.notes
            .map((n) => noteToMidi(n))
            .filter((m): m is number => m !== null);
      sched.push({ atSec: t, durSec, midis, globalBeatIndex: globalBeatIndex++ });
      t += durSec;
    }
  }
  return sched;
}

export interface TabPlayerHandle {
  stop: () => void;
}

/**
 * Load the violin soundfont, schedule every beat against the AudioContext clock,
 * and drive an onCursor callback for the moving highlight. Must be called from a
 * user gesture (Play click) so the AudioContext can start.
 */
export async function createTabPlayer(
  doc: TabDoc,
  bpm: number,
  callbacks: { onCursor: (globalBeatIndex: number) => void; onEnd: () => void },
): Promise<TabPlayerHandle> {
  const context = new AudioContext();
  await context.resume();

  const instrument = Soundfont(context, { instrument: VIOLIN.patch });
  await instrument.load;

  const sched = buildSchedule(doc, bpm);
  const start = context.currentTime + 0.1;
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  for (const beat of sched) {
    for (const midi of beat.midis) {
      instrument.start({ note: midi, time: start + beat.atSec, duration: beat.durSec });
    }
    timers.push(
      setTimeout(() => {
        if (!stopped) callbacks.onCursor(beat.globalBeatIndex);
      }, beat.atSec * 1000 + 100),
    );
  }

  const totalMs =
    (sched.length ? sched[sched.length - 1].atSec + sched[sched.length - 1].durSec : 0) * 1000 +
    150;
  timers.push(
    setTimeout(() => {
      if (!stopped) callbacks.onEnd();
    }, totalMs),
  );

  return {
    stop: () => {
      stopped = true;
      timers.forEach(clearTimeout);
      instrument.stop();
      void context.close();
    },
  };
}
