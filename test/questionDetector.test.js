const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extractSuggestions, classifyMicSpeaker } = require('../src/main/questionDetector');

const seg = (text, id = Math.random().toString(36)) => ({ id, text });

describe('keyword chips (extractSuggestions)', () => {
  it('finds technical terms and keeps multi-word phrases together', () => {
    const terms = extractSuggestions([
      seg('How would you handle a race condition in Rust with a Kalman filter?')
    ]);
    assert.deepEqual(terms, ['race condition', 'Kalman filter', 'Rust']);
  });

  it('ignores filler and plain conversation', () => {
    assert.deepEqual(
      extractSuggestions([seg('Sure, tell me about your experience, that would be really nice.')]),
      []
    );
  });

  it('returns at most 8 chips without duplicates', () => {
    const terms = extractSuggestions([
      seg('Python Python Docker Kubernetes Linux SQL CUDA PyTorch TensorFlow gRPC GraphQL')
    ]);
    assert.equal(terms.length, 8);
    assert.equal(new Set(terms.map((t) => t.toLowerCase())).size, 8);
  });

  it('looks only at the clicked box when one is given', () => {
    const segs = [seg('We use Docker', 'a'), seg('Then Kubernetes', 'b')];
    assert.deepEqual(extractSuggestions(segs, 'a'), ['Docker']);
  });

  it('handles an empty transcript', () => {
    assert.deepEqual(extractSuggestions([]), []);
  });
});

describe('who is speaking on the mic (classifyMicSpeaker)', () => {
  it('keeps system audio as the other person', () => {
    assert.deepEqual(classifyMicSpeaker({ rawSpeaker: 'other', text: 'hi' }), {
      speaker: 'other',
      isBleed: false
    });
  });

  it('marks mic text that echoes the speakers as bleed', () => {
    const r = classifyMicSpeaker({
      rawSpeaker: 'me',
      text: 'tell me about yourself',
      lastSystemRmsAt: Date.now(),
      lastOtherText: 'So, tell me about yourself please'
    });
    assert.deepEqual(r, { speaker: 'other', isBleed: true });
  });

  it('treats the mic as you in direct mode', () => {
    assert.equal(classifyMicSpeaker({ rawSpeaker: 'me', text: 'hello', avgRms: 0.001 }).speaker, 'me');
  });

  it('in room mode, labels clearly quieter speech as the other person', () => {
    const rmsHistory = [];
    for (let i = 0; i < 8; i++) {
      classifyMicSpeaker({ rawSpeaker: 'me', text: 'x', avgRms: 0.1, micMode: 'room', rmsHistory });
    }
    assert.equal(
      classifyMicSpeaker({ rawSpeaker: 'me', text: 'far', avgRms: 0.03, micMode: 'room', rmsHistory })
        .speaker,
      'other'
    );
    assert.equal(
      classifyMicSpeaker({ rawSpeaker: 'me', text: 'near', avgRms: 0.09, micMode: 'room', rmsHistory })
        .speaker,
      'me'
    );
  });

  it('does not let streaming partial results skew the loudness baseline', () => {
    const rmsHistory = [];
    classifyMicSpeaker({
      rawSpeaker: 'me',
      text: 'x',
      avgRms: 0.1,
      micMode: 'room',
      isFinal: false,
      rmsHistory
    });
    assert.equal(rmsHistory.length, 0);
  });
});
