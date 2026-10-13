// Puts the owner's ElevenLabs voice-over into a tutorial video. See README.md next to this file.
//
//   node scripts/guide-video/voice.mjs <video> lines       where each line (and each sentence, for
//                                                         the captions) is in the voice file
//   node scripts/guide-video/voice.mjs <video> estimate    no voice yet: timings as if spoken, so the
//                                                         video can go out with captions only
//   node scripts/guide-video/voice.mjs <video> mix <OUT>   the MP4, WebM, captions (.vtt) and cover,
//                                                         from record.mjs (silent if estimated)
//
// <video> names everything: docs/video-scripts/<video>-voiceover.md (the lines),
// assets/voiceover/<video>/ (voiceover.mp3 and lines.json) and apps/web/public/videos/<video>.*
// (VIDEOS overrides that folder, for test runs).
// FFMPEG: the ffmpeg to use (default `ffmpeg`): 5.1 or newer, with libx264, libvpx-vp9 and libopus.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VIDEOS = path.resolve(process.env.VIDEOS ?? path.join(REPO, "apps/web/public/videos"));
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";

const TARGET_LUFS = -16; // phones and the web
const LIMITER_LOSS = 0.7; // dB the limiter takes back off the loudness
const LEAD = 0.15; // s from a scene appearing to its line starting (record.mjs and mix read it from lines.json)
// Captions show one sentence at a time, switching just before it's said, unless that would
// leave one up too briefly to read: then it joins its neighbour.
const EARLY = 0.1; // s
const READ_CPS = 20; // characters a second (they hear it too)
const MIN_ON_SCREEN = 1.0; // s
// How fast the voice speaks, fitted to the Facebook video's ElevenLabs voice (±0.3 s a line):
// for timing a video before its voice exists.
const SPOKEN_CPS = 17.4;
const SENTENCE_GAP = 0.1; // s
const BREAK = 1.5; // s, the <break> between lines

/** Where one video's files live. */
function files(video) {
  const voiceDir = path.join(REPO, "assets/voiceover", video);
  return {
    script: path.join(REPO, "docs/video-scripts", `${video}-voiceover.md`),
    voiceDir,
    voice: path.join(voiceDir, "voiceover.mp3"),
    lines: path.join(voiceDir, "lines.json"),
    out: (ext) => path.join(VIDEOS, `${video}.${ext}`),
  };
}

/** Runs ffmpeg and returns what it printed (its log goes to stderr). */
function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-nostats", ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(" ")}\n${r.stderr.slice(-2000)}`);
  return `${r.stdout}\n${r.stderr}`;
}
const seconds = (log) => {
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(log);
  if (!m) throw new Error("No duration in ffmpeg's output");
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
};
/** ebur128's end-of-file summary: integrated loudness and true peak. */
function loudness(log) {
  const summary = log.slice(log.lastIndexOf("Summary:"));
  const i = /I:\s+(-?[\d.]+) LUFS/.exec(summary);
  const p = /Peak:\s+(-?[\d.]+) dBFS/.exec(summary);
  if (!i || !p) throw new Error("No loudness summary in ffmpeg's output");
  return { lufs: Number(i[1]), peak: Number(p[1]) };
}
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
// Whole seconds, rounded down as video players show a length.
const clock = (s) => {
  const r = Math.floor(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
};
const sentencesOf = (text) => text.split(/(?<=[.!?])\s+/);

/** The lines in order, [id, words]: the first and third columns of the script's table. */
function script(f) {
  const doc = readFileSync(f.script, "utf8");
  const rows = [...doc.matchAll(/^\| `([^`]+)` \|[^|]*\|([^|]+)\|/gm)].map((m) => [m[1], m[2].trim()]);
  if (!rows.length) throw new Error(`No lines in ${path.relative(REPO, f.script)}`);
  return rows;
}

/**
 * The captions for one line: [seconds after the clip starts, words], one per sentence. A
 * sentence starts at the end of the longest short pause near where its share of the letters
 * says it should; if the voice ran straight on (or there is no voice yet), at that estimate.
 */
function captions(text, from, to, clipStart, gaps) {
  const sentences = sentencesOf(text);
  const letters = sentences.reduce((n, t) => n + t.length, 0);
  const starts = [from];
  let before = 0;
  for (let k = 1; k < sentences.length; k++) {
    before += sentences[k - 1].length;
    const guess = from + ((to - from) * before) / letters;
    const reach = Math.max(0.5, (to - from) * 0.15);
    const gap = gaps
      .filter((g) => g.start > starts[k - 1] && g.end < to && Math.abs((g.start + g.end) / 2 - guess) <= reach)
      .sort((a, b) => b.end - b.start - (a.end - a.start))[0];
    starts.push(gap ? gap.end : guess);
  }
  let cues = sentences.map((t, k) => ({ text: t, at: k === 0 ? 0 : starts[k] - EARLY - clipStart }));
  // How long each would be on screen: the first from the scene appearing, the last until about
  // a second after the line ends (record.mjs holds the scene that long).
  const shown = (i) => (i + 1 < cues.length ? cues[i + 1].at + LEAD : to - clipStart + LEAD + 1.0) - (i === 0 ? 0 : cues[i].at + LEAD);
  for (let i = 0; i < cues.length; ) {
    if (cues.length > 1 && shown(i) < Math.max(MIN_ON_SCREEN, cues[i].text.length / READ_CPS)) {
      const j = i + 1 < cues.length ? i : i - 1; // join with the next one (the last joins the one before)
      cues.splice(j, 2, { text: `${cues[j].text} ${cues[j + 1].text}`, at: cues[j].at });
      i = 0;
    } else i++;
  }
  return cues.map((c) => [round(c.at), c.text]);
}

/** Works out each line's clip ([from, to] in the voice file, with a little room) and captions. */
function place(rows, span, gaps, total) {
  const out = {};
  console.log("line            from     to   length  captions");
  rows.forEach(([id, words], i) => {
    const [from, to] = span(i, words);
    // A little room either side, so no word is clipped.
    const clip = [round(Math.max(0, from - 0.05)), round(Math.min(total, to + 0.15))];
    out[id] = { clip, cues: captions(words, from, to, clip[0], gaps) };
    const shown = out[id].cues.map(([at, t]) => `+${at.toFixed(2)} ${t}`).join("  |  ");
    console.log(`${id.padEnd(14)} ${from.toFixed(2).padStart(6)} ${to.toFixed(2).padStart(6)} ${(to - from).toFixed(2).padStart(6)}  ${shown}`);
  });
  return out;
}

/** lines.json, one line per voice line, so a re-voiced file shows up as a readable diff. */
function writeLines(f, head, out) {
  const rows = Object.entries(out).map(([id, line]) => `    "${id}": ${JSON.stringify(line)}`).join(",\n");
  const inline = (v) =>
    v && typeof v === "object" ? `{ ${Object.entries(v).map(([k, x]) => `"${k}": ${JSON.stringify(x)}`).join(", ")} }` : JSON.stringify(v);
  const top = Object.entries({ ...head, lead: LEAD }).map(([k, v]) => `  "${k}": ${inline(v)}`);
  mkdirSync(f.voiceDir, { recursive: true });
  writeFileSync(f.lines, `{\n${top.join(",\n")},\n  "lines": {\n${rows}\n  }\n}\n`);
  console.log(`Wrote ${path.relative(REPO, f.lines)}`);
}

// ---- lines: the 1.5 s breaks between lines are the longest pauses ------------------------------
function lines(f) {
  const rows = script(f);
  const count = rows.length;
  const log = ffmpeg(["-i", f.voice, "-af", "silencedetect=n=-40dB:d=0.6,ebur128=peak=true", "-f", "null", "-"]);
  const total = seconds(log);
  const starts = [...log.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, Number(m[1])));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const pauses = starts.map((s, i) => ({ start: s, end: ends[i] ?? total }));

  // Silence before the first word and after the last isn't a break. (The header's duration is
  // rounded, so "at the end" means within a tenth of a second of it, or no end printed at all.)
  const first = pauses[0]?.start === 0 ? pauses.shift().end : 0;
  const trailing = pauses.length && (ends.length < starts.length || total - pauses.at(-1).end < 0.1);
  const last = trailing ? pauses.pop().start : total;
  const byLength = [...pauses].sort((a, b) => b.end - b.start - (a.end - a.start));
  const breaks = byLength.slice(0, count - 1);
  const shortestBreak = breaks.at(-1) ? breaks.at(-1).end - breaks.at(-1).start : 0;
  const longestRest = byLength[count - 1] ? byLength[count - 1].end - byLength[count - 1].start : 0;
  if (breaks.length !== count - 1 || shortestBreak < 1.2 || longestRest > 1.0) {
    throw new Error(
      `Expected ${count} lines with a 1.5 s break between each; found ${pauses.length} pauses ` +
        `(shortest break ${round(shortestBreak)} s, longest other pause ${round(longestRest)} s). ` +
        `Check the file has exactly one <break time="1.5s" /> between lines.`,
    );
  }
  breaks.sort((a, b) => a.start - b.start);

  // The short pauses inside lines, where sentences can break.
  const fine = ffmpeg(["-i", f.voice, "-af", "silencedetect=n=-35dB:d=0.06", "-f", "null", "-"]);
  const gapEnds = [...fine.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const gaps = [...fine.matchAll(/silence_start: (-?[\d.]+)/g)].map((m, i) => ({ start: Number(m[1]), end: gapEnds[i] ?? total }));

  const out = place(rows, (i) => [i === 0 ? first : breaks[i - 1].end, i === count - 1 ? last : breaks[i].start], gaps, total);
  const { lufs, peak } = loudness(log);
  const gainDb = round(TARGET_LUFS - lufs + LIMITER_LOSS, 1);
  console.log(`\n${lufs} LUFS, peak ${peak} dBFS → gain ${gainDb} dB.`);
  writeLines(f, { source: "voiceover.mp3", loudness: { lufs, peak }, gainDb }, out);
}

// ---- estimate: no voice yet, so time each line as the voice would say it ------------------------
function estimate(f) {
  let t = 0;
  const out = place(
    script(f),
    (i, words) => {
      const from = t;
      const to = from + words.length / SPOKEN_CPS + (sentencesOf(words).length - 1) * SENTENCE_GAP;
      t = to + BREAK;
      return [from, to];
    },
    [],
    Infinity,
  );
  writeLines(f, { source: null, estimated: true }, out);
}

// ---- mix: the voice under the recording, each line as its scene appears ------------------------
/** When the full-screen orange cards (title and end) are on screen in the raw recording. */
function orangeCards(video) {
  const log = ffmpeg(["-i", video, "-vf", "scale=64:36,signalstats,metadata=mode=print:file=-", "-an", "-f", "null", "-"]);
  const frames = [];
  for (const block of log.split(/(?=frame:\d+)/)) {
    const t = /pts_time:([\d.]+)/.exec(block);
    const u = /signalstats\.UAVG=([\d.]+)/.exec(block);
    const v = /signalstats\.VAVG=([\d.]+)/.exec(block);
    if (t && u && v) frames.push({ t: Number(t[1]), orange: Number(v[1]) > 165 && Number(u[1]) < 95 });
  }
  const runs = [];
  for (const f of frames) {
    if (f.orange && (!runs.length || runs.at(-1).end !== null)) runs.push({ start: f.t, end: null });
    if (!f.orange && runs.length && runs.at(-1).end === null) runs.at(-1).end = f.t;
  }
  if (runs.length < 2 || runs.at(-1).end !== null) throw new Error(`Couldn't find the title and end cards (found ${runs.length} orange stretches)`);
  return { title: runs[0].start, end: runs.at(-1).start };
}

function mix(video, f, outDir) {
  if (!outDir) throw new Error("Usage: voice.mjs <video> mix <OUT folder from record.mjs>");
  const { video: raw, cover, at, end } = JSON.parse(readFileSync(path.join(outDir, "scenes.json"), "utf8"));
  const { gainDb, lead, estimated, lines: parts } = JSON.parse(readFileSync(f.lines, "utf8"));
  const ids = Object.keys(parts);
  for (const id of ids) if (at[id] == null) throw new Error(`No scene for ${id}`);

  // The recording runs on the browser's clock; if it stretched (older Playwright), the voice
  // would drift away from the screen. The end card shows where it should, or we stop here.
  const cards = orangeCards(raw);
  const lastId = ids.at(-1);
  const drift = cards.end - cards.title - at[lastId];
  console.log(`Title card at ${round(cards.title)} s, end card ${round(cards.end - cards.title)} s later (expected ${round(at[lastId])} s): drift ${round(drift)} s`);
  if (Math.abs(drift) > 0.25) throw new Error("The recording drifted from the script's clock; use Playwright 1.63 or newer and record again");

  // From the title card's first frame (the voice's zero) to the end of the end card.
  let input = ["-y", "-ss", String(cards.title), "-i", raw, "-t", String(end), "-r", "25"];
  let mp4Audio = [];
  let webmAudio = [];
  if (!estimated) {
    const wav = path.join(outDir, "voice.wav");
    const split = ids.map((_, i) => `[s${i}]`).join("");
    const placed = ids.map((id, i) => {
      const [from, to] = parts[id].clip;
      const delay = Math.round((at[id] + lead) * 1000);
      return `[s${i}]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS,adelay=delays=${delay}:all=1[p${i}]`;
    });
    const graph = [
      `[0:a]aresample=48000,volume=${gainDb}dB,alimiter=limit=0.79:attack=5:release=60:level=0:latency=1,asplit=${ids.length}${split}`,
      ...placed,
      `${ids.map((_, i) => `[p${i}]`).join("")}amix=inputs=${ids.length}:normalize=0:duration=longest[voice]`,
    ].join(";");
    ffmpeg(["-y", "-i", f.voice, "-filter_complex", graph, "-map", "[voice]", "-ac", "1", "-c:a", "pcm_s16le", wav]);
    input = ["-y", "-ss", String(cards.title), "-i", raw, "-i", wav, "-map", "0:v", "-map", "1:a", "-af", "apad", "-t", String(end), "-r", "25"];
    mp4Audio = ["-c:a", "aac", "-b:a", "64k", "-ac", "1"];
    webmAudio = ["-c:a", "libopus", "-b:a", "48k", "-ac", "1"];
  } else {
    input.push("-an"); // no voice yet: captions only
  }

  mkdirSync(VIDEOS, { recursive: true });
  const mp4 = f.out("mp4");
  const webm = f.out("webm");
  ffmpeg([...input, "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-profile:v", "high", ...mp4Audio, "-movflags", "+faststart", mp4]);
  ffmpeg([...input, "-c:v", "libvpx-vp9", "-crf", "42", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", ...webmAudio, webm]);
  ffmpeg(["-y", "-i", cover, "-q:v", "4", f.out("jpg")]);

  const check = ffmpeg(["-i", mp4, ...(estimated ? [] : ["-af", "ebur128=peak=true"]), "-f", "null", "-"]);
  const length = seconds(check);

  // The same captions as a WebVTT file, for players and screen readers (the picture has them too).
  const cues = ids.flatMap((id, i) => {
    const [from, to] = parts[id].clip;
    const spoken = at[id] + lead + (to - from);
    const until = Math.min(i + 1 < ids.length ? at[ids[i + 1]] : length, spoken + 1.5);
    const starts = parts[id].cues.map(([offset], k) => (k === 0 ? at[id] : at[id] + lead + offset));
    return parts[id].cues.map(([, text], k) => ({ start: starts[k], end: k + 1 < starts.length ? starts[k + 1] : until, text }));
  });
  const stamp = (t) => new Date(Math.round(t * 1000)).toISOString().slice(11, 23);
  writeFileSync(f.out("vtt"), `WEBVTT\n\n${cues.map((c) => `${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join("\n")}`);

  const mb = (file) => `${(statSync(file).size / 1024 / 1024).toFixed(1)} MB`;
  let sound = "no voice yet (captions only)";
  if (!estimated) {
    const { lufs, peak } = loudness(check);
    sound = `voice ${lufs} LUFS, peak ${peak} dBFS`;
  }
  console.log(`Length ${clock(length)} (${round(length, 1)} s) · MP4 ${mb(mp4)} · WebM ${mb(webm)} · ${sound}`);
  console.log(`Set the "${video}" duration to "${clock(length)}" in apps/web/src/lib/guide-videos.ts.`);
}

const [video, command, arg] = process.argv.slice(2);
const f = video && files(video);
if (command === "lines") lines(f);
else if (command === "estimate") estimate(f);
else if (command === "mix") mix(video, f, arg && path.resolve(arg));
else {
  console.error("Usage: node scripts/guide-video/voice.mjs <video> lines | estimate | mix <OUT>");
  process.exit(1);
}
