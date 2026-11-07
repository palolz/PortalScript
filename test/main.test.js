const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mainHarness = require('./mainHarness');

const settle = () => new Promise((resolve) => setImmediate(resolve));
const utterance = (text, extra = {}) => ({
  speaker: 'other',
  channel: 'other',
  text,
  isFinal: true,
  ...extra
});

test('interview questions stream fast and deep concurrently, include full context and persist', async (t) => {
  const calls = [];
  const releases = [];
  const h = mainHarness(t, {
    streamLLM: (options) =>
      new Promise((resolve) => {
        calls.push(options);
        options.onChunk(`partial ${options.tier}`, 'test');
        releases.push(() => resolve({ text: `finished ${options.tier}`, providerLabel: 'test' }));
      })
  });
  h.session.contextDocs = [{ name: 'role.txt', content: 'Security engineering interview' }];
  const seg = h.upsertTranscriptSegment(
    utterance('How would you investigate an incident?', { segmentId: 'question' })
  );
  await settle();
  assert.deepEqual(calls.map((c) => c.tier).sort(), ['deep', 'fast']);
  const card = h.session.copilotCards[0];
  assert.equal(card.autoDetected, true);
  assert.equal(card.fastStatus, 'streaming');
  assert.equal(card.deepStatus, 'streaming');
  assert.ok(calls.every((c) => c.sessionContextBlock.includes('Security engineering interview')));
  assert.ok(calls.every((c) => c.sessionContextBlock.includes(seg.text)));
  releases.forEach((release) => release());
  await settle();
  assert.equal(card.fastStatus, 'done');
  assert.equal(card.deepStatus, 'done');
  const saved = JSON.parse(fs.readFileSync(path.join(h.session.sessionDir, 'session.json'), 'utf8'));
  assert.equal(saved.copilotCards[0].deepResponse, 'finished deep');
});

test('general mode, candidate speech, partials and ordinary statements never auto-answer', async (t) => {
  const h = mainHarness(t);
  h.saveSettings({ assistMode: 'general' });
  h.upsertTranscriptSegment(utterance('How would you investigate an incident?'));
  h.saveSettings({ assistMode: 'interview' });
  h.upsertTranscriptSegment(utterance('How would you investigate an incident?', { speaker: 'me' }));
  h.upsertTranscriptSegment(
    utterance('Can you explain incident response', { isFinal: false, segmentId: 'partial' })
  );
  h.upsertTranscriptSegment(utterance('Good morning everyone', { segmentId: 'greeting' }));
  await settle();
  assert.equal(h.calls.length, 0);
  assert.equal(h.session.copilotCards.length, 0);
});

test('repeated final event for one utterance does not spawn duplicate answers', async (t) => {
  const h = mainHarness(t);
  const input = utterance('How would you investigate an incident?', { segmentId: 'question' });
  h.upsertTranscriptSegment(input);
  h.upsertTranscriptSegment(input);
  await settle();
  assert.equal(h.session.copilotCards.length, 1);
  assert.equal(h.session.segments[0].text, input.text);
});

test('a question split across finalized turns produces one answer with both parts', async (t) => {
  const h = mainHarness(t);
  h.upsertTranscriptSegment(utterance('Can you', { segmentId: 'prefix' }));
  h.upsertTranscriptSegment(utterance('outline your incident response approach', { segmentId: 'rest' }));
  await settle();
  assert.equal(h.session.copilotCards.length, 1);
  assert.equal(h.session.copilotCards[0].query, 'Can you outline your incident response approach');
});

test('a failing fast engine does not block the remote detailed answer', async (t) => {
  const h = mainHarness(t, {
    streamLLM: async ({ tier, onChunk }) => {
      if (tier === 'fast') throw new Error('Fast unavailable');
      onChunk('Detailed answer', 'test');
      return { text: 'Detailed answer', providerLabel: 'test' };
    }
  });
  h.upsertTranscriptSegment(utterance('How would you investigate an incident?'));
  await settle();
  assert.equal(h.session.copilotCards[0].fastStatus, 'error');
  assert.equal(h.session.copilotCards[0].deepStatus, 'done');
});

test('local engines run quick and detailed responses sequentially', async (t) => {
  const calls = [];
  let releaseFast;
  const h = mainHarness(t, {
    llm: { resolveEngine: async () => ({ provider: 'ollama', model: 'test' }) },
    streamLLM: (options) => {
      calls.push(options.tier);
      if (options.tier === 'fast')
        return new Promise((resolve) => {
          releaseFast = () => resolve({ text: 'Quick answer', providerLabel: 'test' });
        });
      return Promise.resolve({ text: 'Deep answer', providerLabel: 'test' });
    }
  });
  h.upsertTranscriptSegment(utterance('How would you investigate an incident?'));
  await settle();
  assert.deepEqual(calls, ['fast']);
  releaseFast();
  await settle();
  assert.deepEqual(calls, ['fast', 'deep']);
});

test('speaker identities, channel and corrected roles stay independent across turns', async (t) => {
  let count = 0;
  const references = [];
  const h = mainHarness(t, {
    transcribeSpeakers: async (_buffer, _settings, refs) => {
      references.push(refs.map((r) => r.id));
      return count++ === 0
        ? [
            { speakerId: 'new_1', text: 'Good morning everyone' },
            { speakerId: 'new_2', text: 'Welcome to the meeting' }
          ]
        : [{ speakerId: 'speaker_1', text: 'Thanks for joining us' }];
    }
  });
  h.saveSettings({ sttProvider: 'gemini-speakers', geminiApiKey: 'test', assistMode: 'general' });
  async function chunk(speaker) {
    const file = path.join(h.home, `chunk-${count}.wav`);
    fs.writeFileSync(file, Buffer.from('fake audio for mocked STT'));
    h.handleHelperEvent({ type: 'audio_chunk', speaker, path: file, timestamp: Date.now() });
    await h.waitQueue();
    assert.equal(fs.existsSync(file), false);
  }
  await chunk('other');
  assert.equal(h.session.segments.length, 2);
  assert.equal(h.session.segments[0].speakerId, 'speaker_1');
  assert.equal(h.session.segments[1].speakerId, 'speaker_2');
  h.invoke('session:toggle-speaker', h.session.segments[0].id);
  await chunk('other');
  assert.deepEqual(Array.from(references[1]), ['speaker_1', 'speaker_2']);
  assert.equal(h.session.segments[2].speakerId, 'speaker_1');
  assert.equal(h.session.segments[2].speaker, 'me');
  assert.equal(h.session.segments[2].channel, 'other');
  assert.match(h.buildSessionContextBlock(), /Speaker 1 \(candidate; source: other\)/);
  assert.match(h.formatSessionExport(h.session, 'txt'), /Speaker 2 \[system; other\]/);
});

test('manual identity corrections persist and do not change capture channels', (t) => {
  const h = mainHarness(t);
  h.saveSettings({ assistMode: 'general' });
  const seg = h.upsertTranscriptSegment(utterance('Good morning everyone'));
  h.invoke('session:assign-speaker', { segmentId: seg.id, speakerId: 'new' });
  assert.equal(seg.speakerId, 'speaker_1');
  h.invoke('session:toggle-speaker', seg.id);
  assert.equal(seg.channel, 'other');
  assert.equal(seg.speaker, 'me');
  assert.equal(h.session.speakers[0].role, 'me');
  const saved = JSON.parse(fs.readFileSync(path.join(h.session.sessionDir, 'session.json'), 'utf8'));
  assert.equal(saved.segments[0].speakerId, 'speaker_1');
});

test('live jargon is available even before a partial utterance finalizes and without LLM calls', (t) => {
  const h = mainHarness(t);
  const seg = h.upsertTranscriptSegment(utterance('SIEM and SOC', { isFinal: false }));
  assert.equal(seg.jargon[0].term, 'SIEM');
  assert.equal(seg.jargon[1].term, 'SOC');
  assert.equal(h.calls.length, 0);
});

test('late answer results are saved to their original session, not sent into the new session', async (t) => {
  const releases = [];
  const h = mainHarness(t, {
    streamLLM: (options) =>
      new Promise((resolve) => {
        releases.push(() => {
          options.onChunk('late response', 'test');
          resolve({ text: 'late response', providerLabel: 'test' });
        });
      })
  });
  h.upsertTranscriptSegment(utterance('How would you investigate an incident?'));
  await settle();
  const newSession = {
    ...h.session,
    id: 'new-session',
    sessionDir: path.join(h.home, 'new-session'),
    segments: [],
    copilotCards: []
  };
  h.setSession(newSession);
  const eventCount = h.events.length;
  releases.forEach((release) => release());
  await settle();
  assert.equal(newSession.copilotCards.length, 0);
  assert.equal(h.events.length, eventCount);
  assert.equal(h.session.copilotCards[0].fastResponse, 'late response');
});

test('speaker transcription failures surface an error and clean up audio chunks', async (t) => {
  const h = mainHarness(t, {
    transcribeSpeakers: async () => {
      throw new Error('HTTP 429');
    }
  });
  h.saveSettings({ sttProvider: 'gemini-speakers', geminiApiKey: 'test' });
  const file = path.join(h.home, 'failed.wav');
  fs.writeFileSync(file, 'audio');
  h.handleHelperEvent({ type: 'audio_chunk', speaker: 'other', path: file });
  await h.waitQueue();
  assert.equal(fs.existsSync(file), false);
  assert.equal(h.session.segments.length, 0);
  assert.match(h.events.at(-1).payload.message, /HTTP 429/);
});

test('speaker tracking without a Google key cannot start capture', (t) => {
  const h = mainHarness(t);
  h.saveSettings({ sttProvider: 'gemini-speakers' });
  assert.equal(h.startAudioCapture().ok, false);
  assert.match(h.events.at(-1).payload.message, /Google AI Studio API key/);
});

test('context-window cards stream a compact quick answer and start the full detailed answer at once', async (t) => {
  const calls = [];
  const h = mainHarness(t, {
    allowClipboard: true,
    streamLLM: (options) =>
      new Promise((resolve) => {
        calls.push(options);
        setTimeout(() => resolve({ text: `r-${options.tier}`, providerLabel: 'test' }), 5);
      })
  });
  const longDoc = 'x'.repeat(10000);
  h.session.contextDocs.push({ name: 'notes.md', content: longDoc });
  for (const kind of ['box', 'selection', 'answer']) {
    calls.length = 0;
    const card = await h.runCopilotCard({
      kind,
      query: 'How would you contain ransomware on a flat network?'
    });
    assert.equal(card.deepStatus, 'streaming');
    await new Promise((r) => setTimeout(r, 0));
    const tiers = calls.map((c) => c.tier).sort();
    assert.deepEqual(tiers, ['deep', 'fast'], `${kind} should start fast and deep together`);
    const fast = calls.find((c) => c.tier === 'fast');
    const deep = calls.find((c) => c.tier === 'deep');
    assert.ok(fast.sessionContextBlock.length < deep.sessionContextBlock.length);
    assert.ok(deep.sessionContextBlock.includes(longDoc), 'detailed answer keeps full context');
    if (kind === 'answer') assert.equal(deep.kind, 'answer-detail');
    await new Promise((r) => setTimeout(r, 20));
  }
});
