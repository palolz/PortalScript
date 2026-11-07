const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

module.exports = function mainHarness(t, overrides = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'portalscript-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const filename = path.resolve(__dirname, '../src/main/main.js');
  const localRequire = createRequire(filename);
  const handlers = new Map();
  const calls = [];
  const events = [];
  const llm = {
    DEFAULT_FAST_MODEL: 'test-fast',
    DEFAULT_DEEP_MODEL: 'test-deep',
    normalizeGeminiModel: (m) => m,
    resolveEngine: async (tier) => ({ provider: 'gemini', model: tier }),
    ...overrides.llm,
    streamLLM:
      overrides.streamLLM ||
      (async (options) => {
        calls.push(options);
        options.onChunk(`response-${options.tier}`, 'test');
        return { text: `response-${options.tier}`, providerLabel: 'test' };
      })
  };
  const electron = {
    app: { getPath: () => path.join(home, 'userData'), whenReady: () => ({ then() {} }), on() {} },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    clipboard: {
      writeText: () => {
        if (!overrides.allowClipboard) assertNoClipboard();
      }
    },
    safeStorage: { isEncryptionAvailable: () => false }
  };
  function assertNoClipboard() {
    throw new Error('Automatic actions must not overwrite the clipboard');
  }
  const sandbox = {
    require: (name) => {
      if (name === 'electron') return electron;
      if (name === 'os') return { ...os, homedir: () => home };
      if (name === './llmService') return llm;
      if (name === './speakerTranscription') return { transcribeSpeakers: overrides.transcribeSpeakers };
      return localRequire(name);
    },
    __dirname: path.dirname(filename),
    module: { exports: {} },
    process: { env: {}, platform: process.platform, umask: () => 0 },
    Buffer,
    URL,
    console,
    setTimeout,
    clearTimeout
  };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(filename, 'utf8') +
      `
    mainWindow = { isDestroyed: () => false, webContents: { send: (channel, payload) => testEvents.push({channel, payload: JSON.parse(JSON.stringify(payload))}) } };
    module.exports = {
      upsertTranscriptSegment, handleHelperEvent, formatSessionExport, buildSessionContextBlock,
      runCopilotCard, startAudioCapture, saveSettings,
      setSession: (s) => { currentSession = s; },
      getSession: () => currentSession,
      waitQueue: () => speakerQueue,
      invoke: (channel, ...args) => testHandlers.get(channel)({ senderFrame: { url: getAppUrl() } }, ...args)
    };
  `,
    Object.assign(sandbox, { testEvents: events, testHandlers: handlers }),
    { filename }
  );
  const api = sandbox.module.exports;
  api.saveSettings({ assistMode: 'interview' });
  const session = {
    id: 'test-session',
    title: 'Test',
    createdAt: new Date().toISOString(),
    sessionDir: path.join(home, 'session'),
    segments: [],
    copilotCards: [],
    contextDocs: []
  };
  api.setSession(session);
  return { ...api, session, calls, events, home };
};
