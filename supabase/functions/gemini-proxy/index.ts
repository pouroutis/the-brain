// =============================================================================
// The Brain — Gemini Proxy Edge Function
// Phase 9B: Extended to return usage field
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import type { GeminiRequest, GeminiAPIResponse, ProxyResponse, TokenUsage } from '../_shared/types.ts';

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const body: GeminiRequest = await req.json();

    if (body.action !== 'chat') {
      return errorResponse(req, 'Invalid action', 400);
    }

    const apiKey = Deno.env.get('GOOGLE_AI_API_KEY');
    if (!apiKey) {
      return errorResponse(req, 'Google AI API key not configured', 500);
    }

    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // Call Gemini API
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: body.prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1000,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return errorResponse(req, `Gemini API error: ${errorText}`, response.status);
    }

    const data: GeminiAPIResponse = await response.json();

    // Extract content
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? undefined;

    // Extract usage (Phase 9B: pass through usage)
    let usage: TokenUsage | undefined;
    if (data.usageMetadata) {
      usage = {
        inputTokens: data.usageMetadata.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata.totalTokenCount ?? 0,
      };
    }

    // Build response with usage
    const proxyResponse: ProxyResponse = {
      content,
      usage,
    };

    // Also include raw structure for backward compatibility
    return jsonResponse(req, {
      candidates: data.candidates,
      usageMetadata: data.usageMetadata,
      ...proxyResponse,
    });

  } catch (error) {
    console.error('Gemini proxy error:', error);
    return errorResponse(req, error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
