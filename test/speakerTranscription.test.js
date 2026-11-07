const test = require('node:test');
const assert = require('node:assert/strict');
const { transcribeSpeakers } = require('../src/main/speakerTranscription');

function mockFetch(t, response, inspect = () => {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    inspect(url, options);
    return response;
  };
  t.after(() => {
    globalThis.fetch = original;
  });
}

function result(turns) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ turns }) }] } }] })
  };
}

test('speaker audio and references go only to Gemini with the Gemini key', async (t) => {
  const audio = Buffer.from('test audio');
  const references = [{ id: 'speaker_1', audio: 'reference-base64', text: 'Known voice' }];
  mockFetch(
    t,
    result([
      { speakerId: 'speaker_1', text: 'Welcome back.' },
      { speakerId: 'new_1', text: 'Hello.' }
    ]),
    (url, options) => {
      assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com');
      assert.equal(options.headers['x-goog-api-key'], 'test-google');
      assert.ok(options.signal);
      const body = JSON.parse(options.body);
      assert.equal(body.generationConfig.responseMimeType, 'application/json');
      const parts = body.contents[0].parts;
      assert.match(parts[1].text, /speaker_1/);
      assert.equal(parts[2].inlineData.data, 'reference-base64');
      assert.equal(parts.at(-1).inlineData.data, audio.toString('base64'));
      assert.ok(!JSON.stringify(options).includes('test-openai'));
    }
  );
  const turns = await transcribeSpeakers(
    audio,
    { geminiApiKey: 'test-google', openaiApiKey: 'test-openai' },
    references
  );
  assert.equal(turns.length, 2);
  assert.equal(turns[0].speakerId, 'speaker_1');
});

test('unknown voices and silence do not fabricate known identities', async (t) => {
  mockFetch(t, result([{ speakerId: 'unknown', text: ' An uncertain voice. ' }]));
  assert.deepEqual(await transcribeSpeakers(Buffer.alloc(10), { geminiApiKey: 'test' }), [
    { speakerId: 'unknown', text: 'An uncertain voice.' }
  ]);
});

test('silence returns no turns', async (t) => {
  mockFetch(t, result([]));
  assert.deepEqual(await transcribeSpeakers(Buffer.alloc(10), { geminiApiKey: 'test' }), []);
});

test('rejects IDs not in references and malformed turns', async (t) => {
  mockFetch(t, result([{ speakerId: 'speaker_999', text: 'Untrusted identity.' }]));
  await assert.rejects(
    transcribeSpeakers(Buffer.alloc(10), { geminiApiKey: 'test' }),
    /invalid speaker turns/
  );
});

test('HTTP errors are explicit, never a successful empty transcript', async (t) => {
  mockFetch(t, { ok: false, status: 429 });
  await assert.rejects(transcribeSpeakers(Buffer.alloc(10), { geminiApiKey: 'test' }), /HTTP 429/);
});

test('missing Google key never sends audio to another configured provider', async (t) => {
  const original = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  t.after(() => {
    if (original === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = original;
  });
  mockFetch(t, null, () => assert.fail('No request should be sent'));
  await assert.rejects(
    transcribeSpeakers(Buffer.alloc(10), { openaiApiKey: 'test-openai' }),
    /requires a Google/
  );
});
