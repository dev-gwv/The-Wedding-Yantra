// Puts the owner's ElevenLabs voice-over into the tutorial video. See README.md next to this file.
//
//   node scripts/guide-video/voice.mjs lines         where each of the 15 lines (and each sentence,
//                                                    for the captions) is in the voice file
//   node scripts/guide-video/voice.mjs mix <OUT>     the voiced MP4, WebM, captions (.vtt) and cover,
//                                                    from record.mjs
//
// FFMPEG: the ffmpeg to use (default `ffmpeg`): 5.1 or newer, with libx264, libvpx-vp9 and libopus.

import { spawnSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VOICE_DIR = path.join(REPO, "assets/voiceover/connect-facebook");
const VOICE = path.join(VOICE_DIR, "voiceover.mp3");
const LINES_JSON = path.join(VOICE_DIR, "lines.json");
const VIDEOS = path.join(REPO, "apps/web/public/videos");
// The words of each line (and so the captions) come from the script's table.
const SCRIPT = path.join(REPO, "docs/video-scripts/connect-facebook-voiceover.md");
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";

// The 15 lines of the script, in order. record.mjs marks the moment each one's scene appears.
const IDS = [
  "01-title", "02-page", "03-admin", "04-form", "05-leads", "06-continue", "07-login", "08-choose",
  "09-switch-on", "10-receiving", "11-who-gets", "12-test", "13-received", "14-done", "15-help",
];
const TARGET_LUFS = -16; // phones and the web
const LIMITER_LOSS = 0.7; // dB the limiter takes back off the loudness
const LEAD = 0.15; // s from a scene appearing to its line starting (record.mjs and mix read it from lines.json)
// Captions show one sentence at a time, switching just before it's said, unless that would
// leave one up too briefly to read: then it joins its neighbour.
const EARLY = 0.1; // s
const READ_CPS = 20; // characters a second (they hear it too)
const MIN_ON_SCREEN = 1.0; // s

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
const clock = (s) => {
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
};

/** The line to say for each id: the third column of the script's table. */
function script() {
  const doc = readFileSync(SCRIPT, "utf8");
  return Object.fromEntries(
    IDS.map((id) => {
      const m = new RegExp(`^\\| \`${id}\` \\|[^|]*\\|([^|]+)\\|`, "m").exec(doc);
      if (!m) throw new Error(`No line ${id} in ${path.relative(REPO, SCRIPT)}`);
      return [id, m[1].trim()];
    }),
  );
}

/**
 * The captions for one line: [seconds after the clip starts, words], one per sentence. A
 * sentence starts at the end of the longest short pause near where its share of the letters
 * says it should; if the voice ran straight on, at that estimate.
 */
function captions(text, from, to, clipStart, gaps) {
  const sentences = text.split(/(?<=[.!?])\s+/);
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

// ---- lines: the 1.5 s breaks between lines are the 14 longest pauses ---------------------------
function lines() {
  const log = ffmpeg(["-i", VOICE, "-af", "silencedetect=n=-40dB:d=0.6,ebur128=peak=true", "-f", "null", "-"]);
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

  // The short pauses inside lines, where sentences can break.
  const fine = ffmpeg(["-i", VOICE, "-af", "silencedetect=n=-35dB:d=0.06", "-f", "null", "-"]);
  const gapEnds = [...fine.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const gaps = [...fine.matchAll(/silence_start: (-?[\d.]+)/g)].map((m, i) => ({ start: Number(m[1]), end: gapEnds[i] ?? total }));

  const words = script();
  const { lufs, peak } = loudness(log);
  const out = {};
  console.log("line            from     to   length  captions");
  IDS.forEach((id, i) => {
    const from = i === 0 ? first : breaks[i - 1].end;
    const to = i === IDS.length - 1 ? last : breaks[i].start;
    // A little room either side, so no word is clipped.
    const clip = [round(Math.max(0, from - 0.05)), round(Math.min(total, to + 0.15))];
    out[id] = { clip, cues: captions(words[id], from, to, clip[0], gaps) };
    const shown = out[id].cues.map(([at, t]) => `+${at.toFixed(2)} ${t}`).join("  |  ");
    console.log(`${id.padEnd(14)} ${from.toFixed(2).padStart(6)} ${to.toFixed(2).padStart(6)} ${(to - from).toFixed(2).padStart(6)}  ${shown}`);
  });
  const gainDb = round(TARGET_LUFS - lufs + LIMITER_LOSS, 1);
  // One line per voice line, so a re-voiced file shows up as a readable diff.
  const rows = IDS.map((id) => `    "${id}": ${JSON.stringify(out[id])}`).join(",\n");
  writeFileSync(
    LINES_JSON,
    `{\n  "source": "voiceover.mp3",\n  "loudness": { "lufs": ${lufs}, "peak": ${peak} },\n  "gainDb": ${gainDb},\n  "lead": ${LEAD},\n  "lines": {\n${rows}\n  }\n}\n`,
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
  const { video, cover, at, end } = JSON.parse(readFileSync(path.join(outDir, "scenes.json"), "utf8"));
  const { gainDb, lead, lines: parts } = JSON.parse(readFileSync(LINES_JSON, "utf8"));
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
    const [from, to] = parts[id].clip;
    const delay = Math.round((at[id] + lead) * 1000);
    return `[s${i}]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS,adelay=delays=${delay}:all=1[p${i}]`;
  });
  const graph = [
    `[0:a]aresample=48000,volume=${gainDb}dB,alimiter=limit=0.79:attack=5:release=60:level=0:latency=1,asplit=${IDS.length}${split}`,
    ...placed,
    `${IDS.map((_, i) => `[p${i}]`).join("")}amix=inputs=${IDS.length}:normalize=0:duration=longest[voice]`,
  ].join(";");
  ffmpeg(["-y", "-i", VOICE, "-filter_complex", graph, "-map", "[voice]", "-ac", "1", "-c:a", "pcm_s16le", wav]);

  // From the title card's first frame (the voice's zero) to the end of the end card.
  const input = ["-y", "-ss", String(cards.title), "-i", video, "-i", wav, "-map", "0:v", "-map", "1:a", "-af", "apad", "-t", String(end), "-r", "25"];
  const mp4 = path.join(VIDEOS, "connect-facebook.mp4");
  const webm = path.join(VIDEOS, "connect-facebook.webm");
  ffmpeg([...input, "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-profile:v", "high", "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-movflags", "+faststart", mp4]);
  ffmpeg([...input, "-c:v", "libvpx-vp9", "-crf", "42", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-c:a", "libopus", "-b:a", "48k", "-ac", "1", webm]);
  ffmpeg(["-y", "-i", cover, "-q:v", "4", path.join(VIDEOS, "connect-facebook.jpg")]);

  const check = ffmpeg(["-i", mp4, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const length = seconds(check);

  // The same captions as a WebVTT file, for players and screen readers (the picture has them too).
  const cues = IDS.flatMap((id, i) => {
    const [from, to] = parts[id].clip;
    const spoken = at[id] + lead + (to - from);
    const until = Math.min(i + 1 < IDS.length ? at[IDS[i + 1]] : length, spoken + 1.5);
    const starts = parts[id].cues.map(([offset], k) => (k === 0 ? at[id] : at[id] + lead + offset));
    return parts[id].cues.map(([, text], k) => ({ start: starts[k], end: k + 1 < starts.length ? starts[k + 1] : until, text }));
  });
  const stamp = (t) => new Date(Math.round(t * 1000)).toISOString().slice(11, 23);
  const vtt = path.join(VIDEOS, "connect-facebook.vtt");
  writeFileSync(vtt, `WEBVTT\n\n${cues.map((c) => `${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join("\n")}`);
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
