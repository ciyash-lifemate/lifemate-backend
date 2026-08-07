// Thin wrapper over the Gemini generateContent REST API. Uses global fetch
// (Node 18+) rather than @google/genai so there's no extra dependency and no
// SDK version drift to chase.

import { env } from '../../../config/env.js';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 20000;

export const isGeminiConfigured = () => Boolean(env.gemini.apiKey);

/**
 * One generateContent round-trip.
 *
 * @param {object[]} contents  Full conversation so far, in Gemini's
 *   { role, parts } shape. Model turns must be echoed back verbatim - Gemini 3
 *   models attach a `thoughtSignature` to their parts and reject a follow-up
 *   request that drops it during a function-calling exchange.
 * @param {object}   [options]
 * @param {string}   [options.systemInstruction]
 * @param {object[]} [options.tools] Gemini tool declarations.
 * @returns {Promise<object>} The first candidate's `content` ({ role, parts }).
 */
export const generateContent = async (contents, { systemInstruction, tools } = {}) => {
  if (!isGeminiConfigured()) throw new Error('GEMINI_API_KEY is not configured');

  // AbortSignal.timeout, not a manual controller + setTimeout - the timer is
  // cleared for us when the request settles, so a fast reply doesn't leave a
  // pending timeout holding the event loop open.
  const res = await fetch(`${API_ROOT}/${env.gemini.model}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': env.gemini.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents,
      ...(systemInstruction && { systemInstruction: { parts: [{ text: systemInstruction }] } }),
      ...(tools && { tools }),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini API ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  const content = json.candidates?.[0]?.content;
  if (!content) {
    // Safety blocks and recitation stops come back as a candidate with no
    // content at all, so there is nothing to hand to the caller.
    throw new Error(`Gemini returned no content (finishReason: ${json.candidates?.[0]?.finishReason})`);
  }
  return content;
};

export const textOf = (content) =>
  (content.parts || [])
    .map((part) => part.text)
    .filter(Boolean)
    .join('')
    .trim();

export const functionCallsOf = (content) =>
  (content.parts || []).map((part) => part.functionCall).filter(Boolean);
