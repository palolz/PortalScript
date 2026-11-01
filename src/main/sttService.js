const fs = require('fs');

/**
 * Speech-To-Text Service for WAV Chunks
 * Supports Google AI Studio (Gemini Audio), Groq Whisper, and OpenAI Whisper
 */

async function transcribeWavChunk(wavPath, settings) {
  if (!fs.existsSync(wavPath)) return null;

  const provider = settings.sttProvider || 'hybrid';
  if (provider === 'apple') return null;

  try {
    const fileBuffer = await fs.promises.readFile(wavPath);
    if (fileBuffer.length < 1000) return null;

    // Audio only ever goes to the provider the user explicitly selected — no silent cross-provider fallback.
    if (provider === 'groq') {
      const groqKey = (settings.groqApiKey || process.env.GROQ_API_KEY || '').trim();
      if (!groqKey) return null;
      return await transcribeMultipartWhisper({
        url: 'https://api.groq.com/openai/v1/audio/transcriptions',
        apiKey: groqKey,
        model: 'whisper-large-v3-turbo',
        fileBuffer,
        source: 'groq-whisper'
      });
    }

    if (provider === 'openai') {
      const openaiKey = (settings.openaiApiKey || process.env.OPENAI_API_KEY || '').trim();
      if (!openaiKey) return null;
      return await transcribeMultipartWhisper({
        url: 'https://api.openai.com/v1/audio/transcriptions',
        apiKey: openaiKey,
        model: 'whisper-1',
        fileBuffer,
        source: 'openai-whisper'
      });
    }

    // 'gemini' and 'hybrid' (Apple first, Gemini fallback): Google AI Studio audio
    const apiKey = (settings.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) return null;

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

    const res = await fetch(url, {
      redirect: 'error',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Transcribe the spoken English in this audio clip verbatim. Output ONLY the transcribed words with no commentary or quotes. If there is no speech, output nothing.'
              },
              {
                inlineData: {
                  mimeType: 'audio/wav',
                  data: fileBuffer.toString('base64')
                }
              }
            ]
          }
        ],
        generationConfig: { temperature: 0.0 }
      })
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    if (isHallucination(text)) return null;
    return { text, source: 'gemini-audio' };
  } catch (err) {
    console.error('[STT] Audio transcription error:', err.message);
    return null;
  }
}

async function transcribeMultipartWhisper({ url, apiKey, model, fileBuffer, source }) {
  const form = new FormData();
  form.append('file', new Blob([fileBuffer], { type: 'audio/wav' }), 'chunk.wav');
  form.append('model', model);
  form.append('language', 'en');

  const res = await fetch(url, {
    redirect: 'error',
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = (data?.text || '').trim();
  if (isHallucination(text)) return null;
  return { text, source };
}

function isHallucination(text) {
  if (!text) return true;
  const lower = text.toLowerCase().trim();
  const hallucinations = [
    'you',
    'thank you.',
    'thank you',
    'thanks for watching!',
    'blank_audio',
    '[blank_audio]',
    '(blank audio)',
    'subtitles by',
    'amara.org'
  ];
  return hallucinations.includes(lower) || lower.length < 2;
}

module.exports = { transcribeWavChunk };
