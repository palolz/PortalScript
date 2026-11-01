const { test } = require('node:test');

// Records every request instead of touching the network. Unhandled URLs fail the test.
function mockFetch(t, routes = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, opts = {}) => {
    const href = String(url);
    calls.push({ url: href, host: new URL(href).host, opts });
    for (const [prefix, reply] of Object.entries(routes)) {
      if (href.startsWith(prefix)) return typeof reply === 'function' ? reply(href, opts) : reply();
    }
    throw new Error(`unexpected request to ${href}`);
  });
  return calls;
}

const sse =
  (...events) =>
  () =>
    new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''));
const json = (body) => () => Response.json(body);

// Everything a request carries that could hold a secret.
function requestText(call) {
  const headers = JSON.stringify(call.opts.headers || {});
  const body = typeof call.opts.body === 'string' ? call.opts.body : '';
  return `${call.url}\n${headers}\n${body}`;
}

const ENV_KEYS = [
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY'
];
function clearEnvKeys() {
  for (const k of ENV_KEYS) delete process.env[k];
}

module.exports = { test, mockFetch, sse, json, requestText, clearEnvKeys };
