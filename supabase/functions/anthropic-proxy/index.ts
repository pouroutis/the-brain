// =============================================================================
// The Brain — Anthropic Proxy Edge Function
// Phase 9B: Extended to return usage field
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import type { AnthropicRequest, AnthropicAPIResponse, ProxyResponse, TokenUsage } from '../_shared/types.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const body: AnthropicRequest = await req.json();

    if (body.action !== 'chat') {
      return errorResponse(req, 'Invalid action', 400);
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return errorResponse(req, 'Anthropic API key not configured', 500);
    }

    // Call Anthropic API
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        system: body.systemPrompt,
        messages: [
          { role: 'user', content: body.prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return errorResponse(req, `Anthropic API error: ${errorText}`, response.status);
    }

    const data: AnthropicAPIResponse = await response.json();

    // Extract content
    const content = data.content?.[0]?.text ?? undefined;

    // Extract usage (Phase 9B: pass through usage)
    let usage: TokenUsage | undefined;
    if (data.usage) {
      usage = {
        inputTokens: data.usage.input_tokens ?? 0,
        outputTokens: data.usage.output_tokens ?? 0,
        totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
      };
    }

    // Build response with usage
    const proxyResponse: ProxyResponse = {
      content,
      usage,
    };

    // Also include raw structure for backward compatibility
    return jsonResponse(req, {
      content: data.content,
      usage: data.usage,
      ...proxyResponse,
    });

  } catch (error) {
    console.error('Anthropic proxy error:', error);
    return errorResponse(req, error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
