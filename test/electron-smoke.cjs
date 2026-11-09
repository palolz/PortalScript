const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'portalscript-desktop-test-'));
os.homedir = () => temp;
app.setPath('userData', path.join(temp, 'userData'));
app.setPath('sessionData', path.join(temp, 'browserData'));

const llm = require('../src/main/llmService');
llm.fetchLiveModelCatalog = async () => ({ gemini: ['test-fast', 'test-deep'], ollama: [] });
llm.resolveEngine = async (tier) => ({ provider: 'gemini', model: `test-${tier}` });
llm.streamLLM = async ({ tier, onChunk }) => {
  const text =
    tier === 'fast'
      ? '**Question:** How would you use SIEM in a SOC?\n\n**Say this:**\n> Correlate logs and prioritize suspicious activity.'
      : '**Approach:** Collect logs, correlate events and investigate alerts.\n\n```text\nLogs -> SIEM -> SOC triage -> Response\n```';
  onChunk(text, 'Mock engine');
  return { text, providerLabel: 'Mock engine' };
};

const errors = [];
const timeout = setTimeout(() => {
  console.error('Desktop smoke test timed out');
  app.exit(1);
}, 45000);

async function waitFor(win, expression, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const page = await win.webContents.executeJavaScript('document.body.innerText.slice(0, 600)');
  throw new Error(`Timed out waiting for: ${expression}\nPage: ${page}\nErrors: ${errors.join(' | ')}`);
}

app.on('browser-window-created', (_event, win) => {
  win.webContents.on('preload-error', (_event, _path, error) => errors.push(error.message));
  win.webContents.on('console-message', (_event, level, message) => {
    if (level === 3) errors.push(message);
  });
  win.webContents.once('did-finish-load', async () => {
    try {
      // First launch can wait several seconds on the macOS Keychain (safeStorage) before settings load.
      await waitFor(win, `document.body.textContent.includes('Interview: AUTO')`, 20000);
      await win.webContents.executeJavaScript(`
        window.liveTranscriptAPI.simulateUtterance({ speaker: 'other', text: 'How would you use SIEM in a SOC?' })
      `);
      await waitFor(
        win,
        `document.querySelector('.fast-section')?.textContent.includes('Correlate logs') &&
        document.querySelector('.deep-section')?.textContent.includes('Logs -> SIEM')`
      );
      assert.equal(
        await win.webContents.executeJavaScript(
          `document.querySelector('.jargon-panel').textContent.includes('Security Information and Event Management')`
        ),
        true
      );
      await win.webContents.executeJavaScript(`
        (async () => {
          const current = await window.liveTranscriptAPI.init();
          await window.liveTranscriptAPI.assignSpeaker(current.currentSession.segments[0].id, 'new');
          await window.liveTranscriptAPI.toggleSpeaker(current.currentSession.segments[0].id);
          await window.liveTranscriptAPI.simulateUtterance({ speaker: 'other', text: 'Welcome to the meeting' });
        })()
      `);
      await waitFor(
        win,
        `Array.from(document.querySelectorAll('select[aria-label="Speaker identity"] option')).some(o => o.textContent.includes('Speaker 1'))`
      );
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Interview: AUTO')).click()
      `);
      await waitFor(win, `document.body.textContent.includes('General: MANUAL')`);
      const before = await win.webContents.executeJavaScript(
        `document.querySelectorAll('[data-card-id]').length`
      );
      await win.webContents.executeJavaScript(`
        window.liveTranscriptAPI.simulateUtterance({ speaker: 'other', text: 'How would you handle MFA?' })
      `);
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(
        await win.webContents.executeJavaScript(`document.querySelectorAll('[data-card-id]').length`),
        before
      );
      win.setSize(1080, 680);
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(
        await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('.segment-card')).every(card =>
          Array.from(card.querySelectorAll('.segment-meta button, .segment-meta select')).every(control =>
            control.getBoundingClientRect().right <= card.getBoundingClientRect().right
          )
        )
      `),
        true,
        'Speaker controls must fit at the minimum supported window size'
      );
      assert.deepEqual(errors, []);
      console.log(
        'Desktop smoke passed: real Electron/preload/React, quick + deep answers, text flowchart, glossary, speaker controls, general-mode gate.'
      );
      clearTimeout(timeout);
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
      app.exit(0);
    } catch (error) {
      console.error(error);
      clearTimeout(timeout);
      app.exit(1);
    }
  });
});

app.on('quit', () => fs.rmSync(temp, { recursive: true, force: true }));
require('../src/main/main');
