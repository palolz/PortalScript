// Captures the user-guide screenshots and slow, captioned GIFs for the interview features.
// Runs the real app with a fake audio helper, scripted speaker turns and a scripted AI, so no
// microphone, network or API key is used. Run: npx electron scripts/capture-guide.cjs
const { app, dialog } = require('electron');
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'guide', 'images');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'portalscript-guide-'));
const framesRoot = path.join(temp, 'frames');
fs.mkdirSync(framesRoot);
os.homedir = () => temp;
app.setPath('userData', path.join(temp, 'userData'));
app.setPath('sessionData', path.join(temp, 'browserData'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- Fake native audio helper ----
let helper = null;
childProcess.spawn = (_bin, args = []) => {
  const proc = new EventEmitter();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.stdin = new PassThrough();
  proc.kill = () => setImmediate(() => proc.emit('close', 0));
  if (args.includes('--list-apps')) {
    setImmediate(() => {
      proc.stdout.end(
        `${JSON.stringify({
          type: 'apps',
          apps: [
            { bundleId: 'us.zoom.xos', name: 'zoom.us' },
            { bundleId: 'com.google.Chrome', name: 'Google Chrome' }
          ]
        })}\n`
      );
      proc.emit('close', 0);
    });
    return proc;
  }
  proc.stdin.on('data', (d) => {
    if (String(d).includes('stop')) proc.kill();
  });
  helper = proc;
  return proc;
};
childProcess.execFile = (_bin, args, opts, cb) => {
  const callback = typeof opts === 'function' ? opts : cb;
  if (args.includes('--list-devices')) {
    callback(null, `${JSON.stringify({ devices: [{ id: 'default', name: 'MacBook Pro Microphone' }] })}\n`);
  } else callback(new Error('not available in guide capture'));
  return new EventEmitter();
};
const emit = (event) => helper?.stdout.write(`${JSON.stringify(event)}\n`);
let levelsOn = true;
setInterval(() => {
  if (!helper || !levelsOn) return;
  emit({ type: 'level', speaker: 'me', rms: 0.01 + Math.random() * 0.03 });
  emit({ type: 'level', speaker: 'other', rms: 0.02 + Math.random() * 0.08 });
}, 120);

// ---- Scripted speaker tracking ----
const turnQueue = [];
const speakerTranscription = require('../src/main/speakerTranscription');
speakerTranscription.transcribeSpeakers = async () => {
  await sleep(250);
  return turnQueue.shift() || [];
};
let chunkCount = 0;
function sayChunk(channel, turns) {
  turnQueue.push(turns);
  const chunk = path.join(temp, `chunk-${chunkCount++}.wav`);
  fs.writeFileSync(chunk, Buffer.alloc(64));
  emit({ type: 'audio_chunk', speaker: channel, path: chunk, avgRms: 0.05, timestamp: Date.now() });
}

// ---- Scripted AI ----
const QUESTION =
  'So, first question. Our SIEM fires thousands of alerts a day. How would you cut alert fatigue in the SOC without missing lateral movement after a phishing compromise, and where does EDR fit?';
const QUICK = `**Question:** How to cut SIEM alert fatigue without missing lateral movement after phishing, and where EDR fits.

**Say this:**
> I'd tune the SIEM around the detections that matter: switch off noisy rules, group related alerts into one incident and score them by how critical the asset is. Then I'd use EDR data to confirm what actually happened on the laptop, so analysts work a few strong incidents instead of thousands of alerts.

**If they dig deeper:**
- Map detections to MITRE ATT&CK lateral-movement techniques.
- Auto-close known-harmless alerts with playbooks.
- Track the alert-to-incident ratio and time to respond.`;
const DETAILED = `**Approach:**
1. **Measure the noise.** Rank the last 30 days of SIEM (Security Information and Event Management) rules by volume and true-positive rate. Retire or rewrite the worst ones.
2. **Correlate instead of alerting on single events.** One phishing click, a new process and a login to another server become *one* incident with a risk score.
3. **Use EDR (Endpoint Detection and Response) as ground truth.** It shows the process tree on the laptop, so the SOC (Security Operations Center) can confirm or close an incident in minutes and isolate the host if needed.
4. **Watch lateral movement explicitly.** Keep high-priority detections for remote logins, credential dumping and pass-the-hash, even while tuning everything else down.

\`\`\`text
Phishing email --> user clicks link
                        |
                        v
          EDR: suspicious process on laptop
                        |
                        v
    SIEM correlates mail + EDR + login events
                        |
                        v
     ONE incident, risk-scored --> SOC triage
                        |
                        v
   Isolate host (EDR) --> reset password + MFA
\`\`\`

**Trade-offs:** aggressive tuning can hide a real attack, so review every disabled rule and keep a small "always alert" list for lateral movement.

**Example:** a team suppresses failed-login noise from a scanner but still alerts when the same account logs in to three servers within ten minutes.

**Follow-up:** *"How do you prove the tuning worked?"* Compare alerts per analyst per day and mean time to respond before and after.`;

const llm = require('../src/main/llmService');
llm.fetchLiveModelCatalog = async () => ({
  gemini: ['gemini-3.8-flash', 'gemini-4-argon'],
  ollama: []
});
llm.resolveEngine = async (tier) => ({
  provider: 'gemini',
  model: tier === 'fast' ? 'gemini-3.8-flash' : 'gemini-4-argon'
});
async function streamWords(text, label, onChunk, msPerWord) {
  const words = text.split(/(\s+)/);
  let out = '';
  for (let i = 0; i < words.length; i++) {
    out += words[i];
    if (i % 6 === 0) {
      onChunk(out, label);
      await sleep(msPerWord * 3);
    }
  }
  onChunk(text, label);
  return { text, providerLabel: label };
}
llm.streamLLM = async ({ kind, tier, onChunk }) => {
  const label = tier === 'fast' ? 'Gemini · gemini-3.8-flash' : 'Gemini · gemini-4-argon';
  if (kind === 'answer') return streamWords(QUICK, label, onChunk, 45);
  if (kind === 'answer-detail') {
    await sleep(1600);
    return streamWords(DETAILED, label, onChunk, 40);
  }
  const text = 'Short explanation.';
  onChunk(text, label);
  return { text, providerLabel: label };
};

dialog.showOpenDialog = async () => ({
  canceled: false,
  filePaths: [path.join(temp, 'job-description.md'), path.join(temp, 'company-notes.md')]
});
fs.writeFileSync(
  path.join(temp, 'job-description.md'),
  '# SOC Analyst (Tier 2)\nTriage SIEM alerts, investigate phishing, use EDR to contain hosts.'
);
fs.writeFileSync(path.join(temp, 'company-notes.md'), '# Acme Security\nHybrid cloud, 24/7 SOC.');

// ---- Capture helpers ----
let win;
const js = (code) => win.webContents.executeJavaScript(code);
async function waitFor(expression, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await js(expression)) return;
    await sleep(80);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}
const clickText = (text) =>
  js(`(() => {
    const el = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes(${JSON.stringify(text)}));
    if (!el) return false; el.click(); return true;
  })()`);

async function snap(file) {
  await sleep(250);
  const image = await win.webContents.capturePage();
  const png = path.join(temp, `${file}.png`);
  fs.writeFileSync(png, image.toPNG());
  childProcess.execFileSync(FFMPEG, [
    '-y',
    '-loglevel',
    'error',
    '-i',
    png,
    '-vf',
    'scale=1400:-2:flags=lanczos',
    '-q:v',
    '3',
    path.join(OUT, `${file}.jpg`)
  ]);
  console.log(`saved ${file}.jpg`);
}

const STYLE = `
#guide-caption{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:99999;
  width:820px;padding:12px 22px;border-radius:10px;background:rgba(20,20,19,.94);color:#fff;
  font:600 20px/1.35 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);
  border-left:6px solid #e8772e;text-align:left}
#guide-caption small{display:block;color:#ffb000;font:700 13px/1.4 ui-monospace,Menlo,monospace;
  letter-spacing:.12em;margin-bottom:4px;text-transform:uppercase}
.guide-ring{outline:4px solid #e8772e !important;outline-offset:3px !important;border-radius:6px}`;
async function caption(step, text) {
  await js(`(() => {
    if (!document.getElementById('guide-style')) {
      const s = document.createElement('style'); s.id = 'guide-style'; s.textContent = ${JSON.stringify(STYLE)};
      document.head.appendChild(s);
    }
    let c = document.getElementById('guide-caption');
    if (!c) { c = document.createElement('div'); c.id = 'guide-caption'; document.body.appendChild(c); }
    c.style.display = ${JSON.stringify(text ? 'block' : 'none')};
    c.innerHTML = '<small>' + ${JSON.stringify(step)} + '</small>' + ${JSON.stringify(text)};
  })()`);
}
const ring = (selectorJs) =>
  js(`(() => {
    if (!document.getElementById('guide-style')) {
      const s = document.createElement('style'); s.id = 'guide-style'; s.textContent = ${JSON.stringify(STYLE)};
      document.head.appendChild(s);
    }
    document.querySelectorAll('.guide-ring').forEach(e => e.classList.remove('guide-ring'));
    const el = ${selectorJs}; if (el) el.classList.add('guide-ring'); })()`);
const BUTTON = (text) =>
  `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes(${JSON.stringify(text)}))`;

// GIF recorder: grabs a frame every `interval` ms; each frame is shown for `interval * slow` ms.
function recorder(name) {
  const dir = path.join(framesRoot, name);
  fs.mkdirSync(dir);
  const frames = [];
  let busy = false;
  let timer = null;
  const grab = async (duration) => {
    const image = await win.webContents.capturePage();
    const file = path.join(dir, `${String(frames.length).padStart(4, '0')}.png`);
    fs.writeFileSync(file, image.toPNG());
    frames.push({ file, duration });
  };
  return {
    start(interval = 500, slow = 1.6) {
      timer = setInterval(async () => {
        if (busy) return;
        busy = true;
        await grab((interval * slow) / 1000).catch(() => {});
        busy = false;
      }, interval);
    },
    async hold(seconds) {
      while (busy) await sleep(20);
      await grab(seconds);
    },
    async stop() {
      clearInterval(timer);
      while (busy) await sleep(20);
    },
    build(width = 1000) {
      const list = path.join(dir, 'list.txt');
      const lines = frames.flatMap((f) => [`file '${f.file}'`, `duration ${f.duration.toFixed(2)}`]);
      lines.push(`file '${frames[frames.length - 1].file}'`);
      fs.writeFileSync(list, lines.join('\n'));
      const palette = path.join(dir, 'palette.png');
      const scale = `scale=${width}:-2:flags=lanczos`;
      childProcess.execFileSync(FFMPEG, [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        list,
        '-vf',
        `${scale},palettegen=max_colors=128:stats_mode=diff`,
        palette
      ]);
      childProcess.execFileSync(FFMPEG, [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        list,
        '-i',
        palette,
        '-lavfi',
        `${scale},fps=10[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
        '-loop',
        '0',
        path.join(OUT, `${name}.gif`)
      ]);
      const size = (fs.statSync(path.join(OUT, `${name}.gif`)).size / 1e6).toFixed(1);
      console.log(`saved ${name}.gif (${frames.length} frames, ${size} MB)`);
    }
  };
}

async function run() {
  await waitFor(`document.body.textContent.includes('Interview: AUTO')`);
  await js(`window.liveTranscriptAPI.saveSettings({
    sttProvider: 'gemini-speakers',
    geminiApiKey: 'demo-key-not-real',
    assistMode: 'interview',
    sysAudioApp: { bundleId: 'us.zoom.xos', name: 'zoom.us' }
  })`);
  await js(`window.liveTranscriptAPI.setSysAudioApp({ bundleId: 'us.zoom.xos', name: 'zoom.us' })`);
  await js(`window.liveTranscriptAPI.newSession({ sessionName: 'Interview - Acme SOC Analyst' })`);
  win.webContents.reload();
  await sleep(500);
  await waitFor(`document.body.textContent.includes('Interview: AUTO')`);
  await clickText('ADD');
  await waitFor(`document.body.textContent.toLowerCase().includes('job-desc')`).catch(() => {});

  // 16: Interview mode switch
  await ring(BUTTON('Interview: AUTO'));
  await snap('16-interview-auto');
  await ring('null');

  // 17: Speaker tracking setting
  await clickText('API');
  await waitFor(`document.body.textContent.includes('Speech Transcription Mode')`);
  await js(`(() => {
    const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes('Speech Transcription Mode'));
    label.scrollIntoView({ block: 'center' });
  })()`);
  await ring(
    `Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes('Speech Transcription Mode')).parentElement`
  );
  await snap('17-speaker-tracking-setting');
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);
  if (await js(`document.body.textContent.includes('Speech Transcription Mode')`)) {
    await clickText('Cancel').catch(() => {});
    await clickText('Close').catch(() => {});
  }
  await ring('null');

  // Speaker tracking clip
  await js(`window.liveTranscriptAPI.startRecording()`);
  await sleep(800);
  const speakers = recorder('guide-speaker-tracking');
  await caption('Speaker tracking', 'Capture is running. Each new voice gets its own speaker number.');
  speakers.start(500, 1.5);
  await sleep(1500);
  sayChunk('other', [
    { speakerId: 'new_1', text: "Hi, thanks for joining. I'm Dana, I run the security operations team." }
  ]);
  await sleep(2500);
  await caption('Speaker tracking', 'A second interviewer speaks on the same Zoom audio: Speaker 2.');
  sayChunk('other', [
    { speakerId: 'speaker_1', text: "I've got Marco with me from incident response." },
    { speakerId: 'new_2', text: 'Hi, great to meet you.' }
  ]);
  await sleep(3000);
  await caption('Speaker tracking', 'You answer on your mic: you show up as the CANDIDATE.');
  sayChunk('me', [{ speakerId: 'new_3', text: 'Great to meet you both, and thanks for having me.' }]);
  await sleep(3000);
  await caption(
    'Speaker tracking',
    'Speaker numbers are estimates. If one is wrong, pick the right speaker in this menu.'
  );
  await js(
    `(() => { const s = document.querySelectorAll('select[aria-label="Speaker identity"]'); s[2]?.classList.add('guide-ring'); })()`
  );
  await sleep(1500);
  await speakers.stop();
  await speakers.hold(4);
  await ring('null');
  await caption('', '');
  await snap('18-speakers');

  // Auto answer clip
  const answer = recorder('guide-auto-answer');
  await caption('Interview: AUTO', 'The interviewer asks a question...');
  answer.start(450, 1.6);
  await sleep(1200);
  sayChunk('other', [{ speakerId: 'speaker_2', text: QUESTION }]);
  await waitFor(`!!document.querySelector('.fast-section')`);
  await caption(
    '1 · Quick response',
    'PortalScript spots the question and streams a short answer you can say right away.'
  );
  await waitFor(`document.querySelector('.fast-section')?.textContent.includes('time to respond')`, 30000);
  await sleep(1500);
  await caption(
    '2 · Detailed response',
    'A deeper answer loads underneath at the same time, with a flowchart when it helps.'
  );
  await js(`document.querySelector('.deep-section')?.scrollIntoView({ block: 'start', behavior: 'smooth' })`);
  await waitFor(`document.querySelector('.deep-section')?.textContent.includes('isolate the host')`, 30000);
  await sleep(1200);
  await js(
    `document.querySelector('.deep-section pre')?.scrollIntoView({ block: 'center', behavior: 'smooth' })`
  );
  await waitFor(
    `document.querySelector('.deep-section')?.textContent.includes('time to respond before')`,
    30000
  );
  await sleep(1500);
  await caption(
    '3 · Jargon',
    'Security terms and abbreviations from the conversation are explained at the top.'
  );
  await js(`document.querySelector('.copilot-list').scrollTo({ top: 0, behavior: 'smooth' })`);
  await js(`document.querySelector('.jargon-panel')?.classList.add('guide-ring')`);
  await sleep(2500);
  await answer.stop();
  await answer.hold(4);
  await caption('', '');
  await ring('null');

  levelsOn = false;
  await js(`(() => {
    const card = document.querySelector('[data-card-id]');
    card.querySelectorAll('*').forEach(e => { e.scrollTop = 0; });
    card.scrollIntoView({ block: 'start' });
  })()`);
  await snap('19-auto-answer');
  await js(`document.querySelector('.deep-section pre')?.scrollIntoView({ block: 'center' })`);
  await snap('20-detailed-answer');
  await js(`document.querySelector('.copilot-list').scrollTo({ top: 0 })`);
  await ring(`document.querySelector('.jargon-panel')`);
  await snap('21-jargon');
  await ring('null');

  speakers.build();
  answer.build();
}

app.on('browser-window-created', (_event, created) => {
  if (win) return;
  win = created;
  win.webContents.once('did-finish-load', () => {
    win.setContentSize(1400, 882);
    win.setIgnoreMouseEvents(true);
    run()
      .then(() => app.exit(0))
      .catch((error) => {
        console.error(error);
        app.exit(1);
      });
  });
});
app.on('quit', () => fs.rmSync(temp, { recursive: true, force: true }));
require('../src/main/main');
