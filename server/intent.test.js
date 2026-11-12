import test from 'node:test';
import assert from 'node:assert/strict';

// assistant.js reads its configuration from the environment at import time; keep it keyless here.
process.env.ANTHROPIC_API_KEY = ''; process.env.GROQ_API_KEY = '';
const { validateHiringIntent, createIntentFilter, HIRING_MARKER } = await import('./assistant.js');

test('clear, affirmative hiring interest is accepted', () => {
  for (const m of [
    'I want to hire him',
    "We'd like to offer him a role",
    'How can we hire you?',
    'We would like to offer him a position on our team.',
    "We're hiring him for our ML platform team",
    'I am ready to hire Med Amin',
    'We’d love to bring him on board',
  ]) assert.equal(validateHiringIntent(m), true, m);
});

test('questions, hypotheticals, quotes and negatives are rejected', () => {
  for (const m of [
    'Why should I hire him?',
    'Should we hire him?',
    'If we were hiring, would he be a fit?',
    'What if I wanted to hire him?',
    'Hypothetically, we want to hire him',
    'My colleague said "I want to hire him"',
    'We aren\'t hiring',
    'We are not hiring right now',
    "I don't want to hire him",
    'We never hire remote engineers',
    'What does he work on?',
    'hire',
    '',
  ]) assert.equal(validateHiringIntent(m), false, m);
});

test('intent markers are stripped from the stream, even split across deltas', () => {
  let shown = '';
  const f = createIntentFilter(s => { shown += s; });
  for (const d of ['Great news! Leave a message [below].\n[[in', 'tent:hiring_', 'interest]]', '\n']) f.push(d);
  const { text, intents } = f.finish();
  assert.equal(shown.includes('[['), false);
  assert.equal(shown.trimEnd(), 'Great news! Leave a message [below].');
  assert.equal(text, 'Great news! Leave a message [below].');
  assert.deepEqual([...intents], ['hiring_interest']);
  assert.equal(HIRING_MARKER, '[[intent:hiring_interest]]');
});

test('ordinary brackets pass through and unfinished markers are dropped', () => {
  let shown = '';
  const f = createIntentFilter(s => { shown += s; });
  f.push('See [Projects](#work) and [[docs]]. ');
  f.push('[[intent:hir');
  const { text, intents } = f.finish();
  assert.equal(shown, 'See [Projects](#work) and [[docs]]. ');
  assert.equal(text, 'See [Projects](#work) and [[docs]].');
  assert.equal(intents.size, 0);
});
