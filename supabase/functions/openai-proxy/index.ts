// =============================================================================
// The Brain — OpenAI Proxy Edge Function
// Phase 9B: Extended to return usage field
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import type { OpenAIRequest, OpenAIAPIResponse, ProxyResponse, TokenUsage } from '../_shared/types.ts';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const body: OpenAIRequest = await req.json();

    if (body.action !== 'chat') {
      return errorResponse(req, 'Invalid action', 400);
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return errorResponse(req, 'OpenAI API key not configured', 500);
    }

    // Build messages array
    const messages = [
      { role: 'system', content: body.systemPrompt },
      ...body.messages,
      { role: 'user', content: body.userMessage },
    ];

    // Call OpenAI API
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        max_tokens: 1000,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return errorResponse(req, `OpenAI API error: ${errorText}`, response.status);
    }

    const data: OpenAIAPIResponse = await response.json();

    // Extract content
    const content = data.choices?.[0]?.message?.content ?? undefined;

    // Extract usage (Phase 9B: pass through usage)
    let usage: TokenUsage | undefined;
    if (data.usage) {
      usage = {
        inputTokens: data.usage.prompt_tokens ?? 0,
        outputTokens: data.usage.completion_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0,
      };
    }

    // Build response with usage
    const proxyResponse: ProxyResponse = {
      content,
      usage,
    };

    // Also include raw structure for backward compatibility
    return jsonResponse(req, {
      choices: data.choices,
      usage: data.usage,
      ...proxyResponse,
    });

  } catch (error) {
    console.error('OpenAI proxy error:', error);
    return errorResponse(req, error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
