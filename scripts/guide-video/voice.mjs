// Puts the owner's ElevenLabs voice-over into the tutorial video. See README.md next to this file.
//
//   node scripts/guide-video/voice.mjs lines         where each of the 15 lines is in the voice file
//   node scripts/guide-video/voice.mjs mix <OUT>     the voiced MP4, WebM and cover, from record.mjs
//
// FFMPEG: the ffmpeg to use (default `ffmpeg`; any build with libx264, libvpx-vp9 and libopus).

import { spawnSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VOICE_DIR = path.join(REPO, "assets/voiceover/connect-facebook");
const VOICE = path.join(VOICE_DIR, "voiceover.mp3");
const LINES_JSON = path.join(VOICE_DIR, "lines.json");
const VIDEOS = path.join(REPO, "apps/web/public/videos");
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";

// The 15 lines of docs/video-scripts/connect-facebook-voiceover.md, in order. record.mjs marks
// the moment each one's scene appears.
const IDS = [
  "01-title", "02-page", "03-admin", "04-form", "05-leads", "06-continue", "07-login", "08-choose",
  "09-switch-on", "10-receiving", "11-who-gets", "12-test", "13-received", "14-done", "15-help",
];
const TARGET_LUFS = -16; // phones and the web
const LIMITER_LOSS = 0.7; // dB the limiter takes back off the loudness

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
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

// ---- lines: the 1.5 s breaks between lines are the 14 longest pauses ---------------------------
function lines() {
  const log = ffmpeg(["-i", VOICE, "-af", "silencedetect=n=-40dB:d=0.6,ebur128=peak=true:framelog=quiet", "-f", "null", "-"]);
  const total = seconds(log);
  const starts = [...log.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, Number(m[1])));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const pauses = starts.map((s, i) => ({ start: s, end: ends[i] ?? total }));

  // Silence before the first word and after the last isn't a break.
  const first = pauses[0]?.start === 0 ? pauses.shift().end : 0;
  const last = pauses.at(-1)?.end === total ? pauses.pop().start : total;
  const byLength = [...pauses].sort((a, b) => b.end - b.start - (a.end - a.start));
  const breaks = byLength.slice(0, IDS.length - 1);
  const shortestBreak = breaks.at(-1) ? breaks.at(-1).end - breaks.at(-1).start : 0;
  const longestRest = byLength[IDS.length - 1] ? byLength[IDS.length - 1].end - byLength[IDS.length - 1].start : 0;
  if (breaks.length !== IDS.length - 1 || shortestBreak < 1.2 || longestRest > 1.0) {
    throw new Error(
      `Expected ${IDS.length} lines with a 1.5 s break between each; found ${pauses.length} pauses ` +
        `(shortest break ${round(shortestBreak)} s, longest other pause ${round(longestRest)} s). ` +
        `Check the file has exactly one <break time="1.5s" /> between lines.`,
    );
  }
  breaks.sort((a, b) => a.start - b.start);

  const { lufs, peak } = loudness(log);
  const out = {};
  console.log("line            from     to   length");
  IDS.forEach((id, i) => {
    const from = i === 0 ? first : breaks[i - 1].end;
    const to = i === IDS.length - 1 ? last : breaks[i].start;
    // A little room either side, so no word is clipped.
    out[id] = [round(Math.max(0, from - 0.05)), round(Math.min(total, to + 0.15))];
    console.log(`${id.padEnd(14)} ${from.toFixed(2).padStart(6)} ${to.toFixed(2).padStart(6)} ${(to - from).toFixed(2).padStart(6)}`);
  });
  const gainDb = round(TARGET_LUFS - lufs + LIMITER_LOSS, 1);
  // One line per voice line, so a re-voiced file shows up as a readable diff.
  const rows = IDS.map((id) => `    "${id}": [${out[id].join(", ")}]`).join(",\n");
  writeFileSync(
    LINES_JSON,
    `{\n  "source": "voiceover.mp3",\n  "loudness": { "lufs": ${lufs}, "peak": ${peak} },\n  "gainDb": ${gainDb},\n  "lines": {\n${rows}\n  }\n}\n`,
  );
  console.log(`\n${lufs} LUFS, peak ${peak} dBFS → gain ${gainDb} dB. Wrote ${path.relative(REPO, LINES_JSON)}`);
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

function mix(outDir) {
  if (!outDir) throw new Error("Usage: voice.mjs mix <OUT folder from record.mjs>");
  const { video, cover, at } = JSON.parse(readFileSync(path.join(outDir, "scenes.json"), "utf8"));
  const { gainDb, lines: parts } = JSON.parse(readFileSync(LINES_JSON, "utf8"));
  for (const id of IDS) if (at[id] == null || !parts[id]) throw new Error(`No ${at[id] == null ? "scene" : "line"} for ${id}`);

  // The recording runs on the browser's clock; if it stretched (older Playwright), the voice
  // would drift away from the screen. The end card shows where it should, or we stop here.
  const cards = orangeCards(video);
  const drift = cards.end - cards.title - at["15-help"];
  console.log(`Title card at ${round(cards.title)} s, end card ${round(cards.end - cards.title)} s later (expected ${round(at["15-help"])} s): drift ${round(drift)} s`);
  if (Math.abs(drift) > 0.25) throw new Error("The recording drifted from the script's clock; use Playwright 1.63 or newer and record again");

  const wav = path.join(outDir, "voice.wav");
  const split = IDS.map((_, i) => `[s${i}]`).join("");
  const placed = IDS.map((id, i) => {
    const [from, to] = parts[id];
    const delay = Math.round(Math.max(at[id] + 0.15, 0.4) * 1000);
    return `[s${i}]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS,adelay=delays=${delay}:all=1[p${i}]`;
  });
  const graph = [
    `[0:a]aresample=48000,volume=${gainDb}dB,alimiter=limit=0.79:attack=5:release=60:level=0:latency=1,asplit=${IDS.length}${split}`,
    ...placed,
    `${IDS.map((_, i) => `[p${i}]`).join("")}amix=inputs=${IDS.length}:normalize=0:duration=longest[voice]`,
  ].join(";");
  ffmpeg(["-y", "-i", VOICE, "-filter_complex", graph, "-map", "[voice]", "-ac", "1", "-c:a", "pcm_s16le", wav]);

  // Cut at the title card's first frame: the voice's zero.
  const input = ["-y", "-ss", String(cards.title), "-i", video, "-i", wav, "-map", "0:v", "-map", "1:a", "-af", "apad", "-shortest", "-r", "25"];
  const mp4 = path.join(VIDEOS, "connect-facebook.mp4");
  const webm = path.join(VIDEOS, "connect-facebook.webm");
  ffmpeg([...input, "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-profile:v", "high", "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-movflags", "+faststart", mp4]);
  ffmpeg([...input, "-c:v", "libvpx-vp9", "-crf", "42", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-c:a", "libopus", "-b:a", "48k", "-ac", "1", webm]);
  ffmpeg(["-y", "-i", cover, "-q:v", "4", path.join(VIDEOS, "connect-facebook.jpg")]);

  const check = ffmpeg(["-i", mp4, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"]);
  const length = seconds(check);
  const { lufs, peak } = loudness(check);
  const mb = (f) => `${(statSync(f).size / 1024 / 1024).toFixed(1)} MB`;
  console.log(`Length ${clock(length)} (${round(length, 1)} s) · MP4 ${mb(mp4)} · WebM ${mb(webm)} · voice ${lufs} LUFS, peak ${peak} dBFS`);
  console.log(`Set duration: "${clock(length)}" in BUILT_IN_VIDEO (apps/web/src/lib/facebook-guide.ts).`);
}

const [command, arg] = process.argv.slice(2);
if (command === "lines") lines();
else if (command === "mix") mix(arg && path.resolve(arg));
else {
  console.error("Usage: node scripts/guide-video/voice.mjs lines | mix <OUT>");
  process.exit(1);
}
