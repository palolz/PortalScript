const test = require('node:test');
const assert = require('node:assert/strict');
const { streamLLM } = require('../src/main/llmService');

function sse(text) {
  const body = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`;
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function withFetch(t, impl) {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url: String(url), body });
    return impl(String(url), body, requests.length);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return requests;
}

const settings = (extra = {}) => ({
  provider: 'gemini',
  geminiApiKey: 'g-key',
  fastModel: 'gemini-3.8-flash',
  deepModel: 'gemini-4-argon',
  ...extra
});

test('Gemini quick answers use minimal thinking and detailed answers use low thinking', async (t) => {
  const requests = withFetch(t, () => sse('hi'));
  for (const tier of ['fast', 'deep']) {
    const { text } = await streamLLM({
      kind: 'box',
      query: 'What is EDR?',
      tier,
      settings: settings(),
      onChunk() {}
    });
    assert.equal(text, 'hi');
  }
  assert.equal(requests.length, 2);
  assert.ok(
    requests.every(
      (r) => r.url.startsWith('https://generativelanguage.googleapis.com/') && r.url.includes('alt=sse')
    )
  );
  assert.deepEqual(requests[0].body.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
  assert.deepEqual(requests[1].body.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
});

test('models that reject the thinking setting are retried once without it and remembered', async (t) => {
  const requests = withFetch(t, (url, body) =>
    body.generationConfig.thinkingConfig
      ? new Response('{"error":"bad thinkingLevel"}', { status: 400 })
      : sse('ok')
  );
  const s = settings({ fastModel: 'gemini-legacy-flash' });
  assert.equal(
    (await streamLLM({ kind: 'term', query: 'SIEM', tier: 'fast', settings: s, onChunk() {} })).text,
    'ok'
  );
  assert.equal(
    (await streamLLM({ kind: 'term', query: 'SOAR', tier: 'fast', settings: s, onChunk() {} })).text,
    'ok'
  );
  assert.equal(requests.length, 3, 'second call skips the unsupported setting');
  assert.ok(requests.every((r) => r.url.includes('gemini-legacy-flash')));
});
