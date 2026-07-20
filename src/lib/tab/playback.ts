// src/lib/tab/playback.ts
import { Soundfont } from "smplr";
import { beatFraction } from "./durations";
import { getInstrument } from "./instruments";
import { noteToMidi } from "./pitch";
import type { TabDoc } from "./types";

export interface NoteOnset {
  midi: number;
  durSec: number; // includes any tied continuation
}

export interface ScheduledBeat {
  atSec: number;
  durSec: number; // this beat's own duration (drives the cursor + total length)
  onsets: NoteOnset[]; // notes that START sounding at this beat
  globalBeatIndex: number;
}

interface FlatBeat {
  atSec: number;
  durSec: number;
  tie: boolean;
  notes: { string: number; midi: number }[];
  globalBeatIndex: number;
}

/** Pure timing math — unit tested. quarter = 60/bpm seconds. Notes whose pitch
 *  can't be resolved (out-of-range finger/position) are dropped. A beat marked
 *  `tie` sustains each note into the next beat's same-string, same-pitch note:
 *  the first note sounds for the combined duration and the continuation is not
 *  re-articulated. */
export function buildSchedule(doc: TabDoc, bpm: number): ScheduledBeat[] {
  const instrument = getInstrument(doc.instrument);
  const quarterSec = 60 / bpm;
  const flat: FlatBeat[] = [];
  let t = 0;
  let globalBeatIndex = 0;
  for (const measure of doc.measures) {
    for (const beat of measure.beats) {
      const durSec = beatFraction(beat.duration, beat.dotted) * 4 * quarterSec;
      const notes = beat.isRest
        ? []
        : beat.notes
            .map((n) => ({ string: n.string, midi: noteToMidi(n, instrument) }))
            .filter((n): n is { string: number; midi: number } => n.midi !== null);
      flat.push({ atSec: t, durSec, tie: Boolean(beat.tie), notes, globalBeatIndex: globalBeatIndex++ });
      t += durSec;
    }
  }

  const sameNote = (b: FlatBeat, string: number, midi: number) =>
    b.notes.some((n) => n.string === string && n.midi === midi);

  return flat.map((f, i) => {
    const onsets: NoteOnset[] = [];
    for (const n of f.notes) {
      // Skip a note that is the continuation of a tie from the previous beat.
      if (i > 0 && flat[i - 1].tie && sameNote(flat[i - 1], n.string, n.midi)) continue;
      // Follow the tie chain forward, summing durations.
      let dur = f.durSec;
      let j = i;
      while (flat[j].tie && j + 1 < flat.length && sameNote(flat[j + 1], n.string, n.midi)) {
        dur += flat[j + 1].durSec;
        j++;
      }
      onsets.push({ midi: n.midi, durSec: dur });
    }
    return { atSec: f.atSec, durSec: f.durSec, onsets, globalBeatIndex: f.globalBeatIndex };
  });
}

export interface TabPlayerHandle {
  stop: () => void;
}

/**
 * Load the doc's instrument soundfont, schedule every beat against the AudioContext clock,
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

  const instrument = Soundfont(context, { instrument: getInstrument(doc.instrument).patch });
  await instrument.load;

  const sched = buildSchedule(doc, bpm);
  const start = context.currentTime + 0.1;
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  for (const beat of sched) {
    for (const onset of beat.onsets) {
      instrument.start({ note: onset.midi, time: start + beat.atSec, duration: onset.durSec });
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
