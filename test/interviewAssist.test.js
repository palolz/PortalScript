const test = require('node:test');
const assert = require('node:assert/strict');
const { extractJargon, isInterviewQuestion, speakerLabel } = require('../src/main/interviewAssist');
const { extractSuggestions } = require('../src/main/questionDetector');
const { buildPrompts } = require('../src/main/llmService');

test('security abbreviations and jargon have immediate, case-insensitive definitions', () => {
  const terms = extractJargon('How does a siem support SOC with EDR and zero trust?');
  assert.deepEqual(
    terms.map((t) => t.term),
    ['SIEM', 'SOC', 'EDR', 'zero trust']
  );
  assert.equal(terms[0].expansion, 'Security Information and Event Management');
  assert.ok(terms.every((t) => t.meaning.length > 10));
  assert.equal(extractJargon('Soccer and telescopes are unrelated.').length, 0);
  assert.equal(extractJargon('SIEM SIEM').length, 1);
});

test('security terms are suggested alongside existing engineering terms', () => {
  const suggestions = extractSuggestions([{ id: 'one', text: 'SIEM, SOC and Rust borrow checker' }]);
  assert.ok(suggestions.includes('SIEM'));
  assert.ok(suggestions.includes('SOC'));
  assert.ok(suggestions.includes('borrow checker'));
});

test('detects explicit, implied and split interview questions without requiring punctuation', () => {
  for (const question of [
    'How would you secure this API',
    'Tell me about a time you handled an incident',
    'Walk us through your approach',
    'Design a secure authentication system',
    'Have you worked with SIEM',
    'What about incident response',
    'Any thoughts on that?'
  ])
    assert.equal(isInterviewQuestion(question), true, question);
  assert.equal(isInterviewQuestion('the difference between SIEM and SOAR', 'Can you'), true);
  for (const statement of [
    'Good morning everyone',
    'Yes',
    'I will explain the design',
    'We know what is happening'
  ]) {
    assert.equal(isInterviewQuestion(statement), false, statement);
  }
});

test('speaker labels distinguish identity from channel and do not claim verified identities', () => {
  assert.equal(speakerLabel({ speakerId: 'speaker_3', speaker: 'other' }), 'Speaker 3');
  assert.equal(speakerLabel({ speaker: 'me' }), 'Candidate (estimated)');
  assert.equal(speakerLabel({ speaker: 'other' }), 'Other speaker (unidentified)');
});

test('quick interview prompt is bounded and deep prompt provides optional text diagrams', () => {
  const base = {
    kind: 'answer',
    query: 'How does TLS work?',
    sessionContextBlock: 'Speaker 2: TLS question',
    profileMarkdown: ''
  };
  const quick = buildPrompts({ ...base, tier: 'fast' });
  const deep = buildPrompts({ ...base, kind: 'answer-detail', tier: 'deep' });
  assert.match(quick.user, /Under 130 words/);
  assert.match(quick.user, /Never invent personal experience/);
  assert.match(deep.user, /ASCII flowchart/);
  assert.match(deep.user, /Expand specialized jargon/);
  assert.match(deep.user, /Speaker 2/);
  assert.doesNotMatch(deep.user, /Under 130 words/);
  assert.match(buildPrompts({ ...base, tier: 'deep' }).user, /Under 130 words/);
});
