const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mockFetch, json, clearEnvKeys } = require('./helpers');
const { transcribeWavChunk } = require('../src/main/sttService');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portalscript-stt-'));
const wav = path.join(dir, 'chunk.wav');
fs.writeFileSync(wav, Buffer.alloc(4000, 1));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(clearEnvKeys);

const KEYS = { geminiApiKey: 'AIza-g-1', openaiApiKey: 'sk-o-2', groqApiKey: 'gsk-3' };
const routes = {
  'https://generativelanguage.googleapis.com/': json({
    candidates: [{ content: { parts: [{ text: 'hello there' }] } }]
  }),
  'https://api.openai.com/': json({ text: 'hello there' }),
  'https://api.groq.com/': json({ text: 'hello there' })
};

describe('cloud speech-to-text (transcribeWavChunk)', () => {
  it('Apple Speech mode never uploads audio', async (t) => {
    const calls = mockFetch(t, routes);
    assert.equal(await transcribeWavChunk(wav, { sttProvider: 'apple', ...KEYS }), null);
    assert.equal(calls.length, 0);
  });

  for (const [provider, host, header, key] of [
    ['hybrid', 'generativelanguage.googleapis.com', 'x-goog-api-key', KEYS.geminiApiKey],
    ['gemini', 'generativelanguage.googleapis.com', 'x-goog-api-key', KEYS.geminiApiKey],
    ['openai', 'api.openai.com', 'Authorization', `Bearer ${KEYS.openaiApiKey}`],
    ['groq', 'api.groq.com', 'Authorization', `Bearer ${KEYS.groqApiKey}`]
  ]) {
    it(`${provider}: audio goes only to ${host} with only its own key`, async (t) => {
      const calls = mockFetch(t, routes);
      const result = await transcribeWavChunk(wav, { sttProvider: provider, ...KEYS });
      assert.equal(result.text, 'hello there');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].host, host);
      assert.equal(calls[0].opts.redirect, 'error');
      assert.equal(calls[0].opts.headers[header], key);
    });
  }

  it('does not switch to another provider when the chosen one has no key', async (t) => {
    const calls = mockFetch(t, routes);
    assert.equal(
      await transcribeWavChunk(wav, { sttProvider: 'groq', geminiApiKey: KEYS.geminiApiKey }),
      null
    );
    assert.equal(await transcribeWavChunk(wav, { sttProvider: 'openai', groqApiKey: KEYS.groqApiKey }), null);
    assert.equal(calls.length, 0);
  });

  it('drops typical Whisper hallucinations on silence', async (t) => {
    mockFetch(t, { 'https://api.openai.com/': json({ text: 'Thanks for watching!' }) });
    assert.equal(await transcribeWavChunk(wav, { sttProvider: 'openai', ...KEYS }), null);
  });

  it('ignores missing or tiny audio files', async (t) => {
    const calls = mockFetch(t, routes);
    const tiny = path.join(dir, 'tiny.wav');
    fs.writeFileSync(tiny, Buffer.alloc(100));
    assert.equal(
      await transcribeWavChunk(path.join(dir, 'missing.wav'), { sttProvider: 'gemini', ...KEYS }),
      null
    );
    assert.equal(await transcribeWavChunk(tiny, { sttProvider: 'gemini', ...KEYS }), null);
    assert.equal(calls.length, 0);
  });
});
