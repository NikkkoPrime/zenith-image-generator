/**
 * Unified API Client
 *
 * Provides a unified interface for image generation across providers
 * with automatic token rotation on rate limit errors.
 */

import type {
  ApiErrorCode,
  ApiErrorResponse,
  GenerateRequest,
  GenerateSuccessResponse,
  LLMProviderType,
  OptimizeRequest,
  OptimizeResponse,
  TranslateResponse,
  UpscaleRequest,
  UpscaleResponse,
  VideoGenerateRequest,
  VideoTaskResponse,
} from '@z-image/shared'
import { LLM_PROVIDER_CONFIGS } from '@z-image/shared'
import { PROVIDER_CONFIGS, type ProviderType } from './constants'
import { getNextAvailableToken, isQuotaError, markTokenExhausted } from './tokenRotation'

const API_URL = import.meta.env.VITE_API_URL || ''

// Maximum retry attempts for token rotation
const MAX_RETRY_ATTEMPTS = 10

/** API error with code */
export interface ApiErrorInfo {
  message: string
  code?: ApiErrorCode
  details?: ApiErrorResponse['details']
}

/** API response type */
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorInfo?: ApiErrorInfo }

/** Parse error response from API */
function parseErrorResponse(data: unknown): ApiErrorInfo {
  if (typeof data === 'object' && data !== null) {
    const errorData = data as ApiErrorResponse
    return {
      message: errorData.error || 'Unknown error',
      code: errorData.code,
      details: errorData.details,
    }
  }
  return { message: 'Unknown error' }
}

/** Extended error with status and code */
interface ApiError extends Error {
  status?: number
  code?: string
}

/** Generic fetch wrapper with error handling */
async function apiRequest<T>(
  url: string,
  options: RequestInit
): Promise<T> {
  const response = await fetch(url, options)

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error('Invalid response from server')
  }

  if (!response.ok) {
    const errorInfo = parseErrorResponse(data)
    const error = new Error(getErrorMessage(errorInfo)) as ApiError
    error.status = response.status
    error.code = errorInfo.code
    throw error
  }

  return data as T
}

/** Get user-friendly error message based on error code */
export function getErrorMessage(errorInfo: ApiErrorInfo): string {
  const { code, message, details } = errorInfo

  switch (code) {
    case 'AUTH_REQUIRED':
      return `Please configure your ${details?.provider || 'API'} token first`
    case 'AUTH_INVALID':
      return `Invalid ${details?.provider || 'API'} token. Please check your token and try again.`
    case 'AUTH_EXPIRED':
      return `Your ${details?.provider || 'API'} token has expired. Please update it.`
    case 'RATE_LIMITED':
      return `Too many requests. Please wait ${details?.retryAfter ? `${details.retryAfter} seconds` : 'a moment'} and try again.`
    case 'QUOTA_EXCEEDED':
      return `API quota exceeded for ${details?.provider || 'this provider'}. Please check your account.`
    case 'INVALID_PROMPT':
      return message || 'Invalid prompt. Please check your input.'
    case 'PROVIDER_ERROR':
    case 'UPSTREAM_ERROR':
      return details?.upstream || message || 'Provider service error. Please try again.'
    case 'TIMEOUT':
      return `Request timed out. ${details?.provider || 'The service'} may be busy. Please try again.`
    default:
      return message || 'An error occurred. Please try again.'
  }
}

/** Generate image request options */
export interface GenerateOptions {
  provider: ProviderType
  prompt: string
  negativePrompt?: string
  width: number
  height: number
  steps?: number
  seed?: number
  model?: string
}

/** Auth token for API calls */
export interface AuthToken {
  /** Single token (for backward compatibility) */
  token?: string
  /** Multiple tokens for rotation */
  tokens?: string[]
}

/**
 * Internal: Make a single generate API call with specific token
 */
async function generateImageSingle(
  options: GenerateOptions,
  token: string | null
): Promise<GenerateSuccessResponse> {
  const { provider, prompt, negativePrompt, width, height, steps, seed, model } = options

  const providerConfig = PROVIDER_CONFIGS[provider]
  const headers: HeadersInit = { 'Content-Type': 'application/json' }

  if (token && providerConfig) {
    headers[providerConfig.authHeader] = token
  }

  const body: GenerateRequest = {
    provider,
    model: model || 'z-image-turbo',
    prompt,
    negativePrompt,
    width,
    height,
    steps,
    seed,
  }

  return apiRequest<GenerateSuccessResponse>(`${API_URL}/api/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

/**
 * Generate image using the unified API with token rotation
 */
export async function generateImage(
  options: GenerateOptions,
  auth: AuthToken
): Promise<ApiResponse<GenerateSuccessResponse>> {
  const { token, tokens } = auth
  const { provider } = options
  const providerConfig = PROVIDER_CONFIGS[provider]

  // Build token list: prefer tokens array, fallback to single token
  const allTokens = tokens?.length ? tokens : token ? [token] : []

  // No tokens and requires auth
  if (allTokens.length === 0 && providerConfig.requiresAuth) {
    return {
      success: false,
      error: `Please configure your ${providerConfig.name} token first`,
    }
  }

  // No tokens but auth not required - try anonymous
  if (allTokens.length === 0) {
    try {
      const data = await generateImageSingle(options, null)
      return { success: true, data }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      }
    }
  }

  // Token rotation loop
  let attempts = 0
  while (attempts < MAX_RETRY_ATTEMPTS) {
    const nextToken = getNextAvailableToken(provider, allTokens)

    // All tokens exhausted
    if (!nextToken) {
      // Try anonymous if provider allows it
      if (!providerConfig.requiresAuth) {
        try {
          const data = await generateImageSingle(options, null)
          return { success: true, data }
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Network error',
          }
        }
      }
      return {
        success: false,
        error: 'All API tokens exhausted. Quota will reset tomorrow.',
      }
    }

    try {
      const data = await generateImageSingle(options, nextToken)
      return { success: true, data }
    } catch (err) {
      if (isQuotaError(err)) {
        markTokenExhausted(provider, nextToken)
        attempts++
        continue
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      }
    }
  }

  return {
    success: false,
    error: 'Maximum retry attempts reached',
  }
}

/**
 * Internal: Make a single upscale API call with specific token
 */
async function upscaleImageSingle(
  url: string,
  scale: number,
  token: string | null
): Promise<UpscaleResponse> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) headers['X-HF-Token'] = token

  return apiRequest<UpscaleResponse>(`${API_URL}/api/upscale`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url, scale } as UpscaleRequest),
  })
}

/**
 * Upscale image using RealESRGAN with token rotation
 */
export async function upscaleImage(
  url: string,
  scale = 4,
  hfTokens?: string | string[]
): Promise<ApiResponse<UpscaleResponse>> {
  // Build token list
  const allTokens = Array.isArray(hfTokens) ? hfTokens : hfTokens ? [hfTokens] : []

  // No tokens - try anonymous (HuggingFace allows anonymous)
  if (allTokens.length === 0) {
    try {
      const data = await upscaleImageSingle(url, scale, null)
      return { success: true, data }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      }
    }
  }

  // Token rotation loop
  let attempts = 0
  while (attempts < MAX_RETRY_ATTEMPTS) {
    const nextToken = getNextAvailableToken('huggingface', allTokens)

    // All tokens exhausted - try anonymous
    if (!nextToken) {
      try {
        const data = await upscaleImageSingle(url, scale, null)
        return { success: true, data }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Network error',
        }
      }
    }

    try {
      const data = await upscaleImageSingle(url, scale, nextToken)
      return { success: true, data }
    } catch (err) {
      if (isQuotaError(err)) {
        markTokenExhausted('huggingface', nextToken)
        attempts++
        continue
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      }
    }
  }

  return {
    success: false,
    error: 'Maximum retry attempts reached',
  }
}

/** Optimize prompt options */
export interface OptimizeOptions {
  /** The prompt to optimize */
  prompt: string
  /** LLM provider (default: pollinations) */
  provider?: LLMProviderType
  /** Output language (default: en) */
  lang?: 'en' | 'zh'
  /** Specific model to use */
  model?: string
  /** Custom system prompt */
  systemPrompt?: string
}

/** Map LLM provider to token provider for token rotation */
function getLLMTokenProvider(
  provider: LLMProviderType
): 'gitee' | 'modelscope' | 'huggingface' | 'deepseek' | null {
  switch (provider) {
    case 'gitee-llm':
      return 'gitee'
    case 'modelscope-llm':
      return 'modelscope'
    case 'huggingface-llm':
      return 'huggingface'
    case 'deepseek':
      return 'deepseek'
    default:
      return null // pollinations doesn't need token
  }
}

/**
 * Internal: Make a single optimize API call with specific token
 */
async function optimizePromptSingle(
  options: OptimizeOptions,
  token: string | null
): Promise<OptimizeResponse> {
  const { prompt, provider = 'pollinations', lang = 'en', model, systemPrompt } = options

  const providerConfig = LLM_PROVIDER_CONFIGS[provider]
  const headers: HeadersInit = { 'Content-Type': 'application/json' }

  if (token && providerConfig?.needsAuth && providerConfig?.authHeader) {
    headers[providerConfig.authHeader] = token
  }

  return apiRequest<OptimizeResponse>(`${API_URL}/api/optimize`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt, provider, lang, model, systemPrompt } as OptimizeRequest),
  })
}

/**
 * Optimize a prompt using LLM with token rotation
 */
export async function optimizePrompt(
  options: OptimizeOptions,
  tokenOrTokens?: string | string[]
): Promise<ApiResponse<OptimizeResponse>> {
  const { provider = 'pollinations' } = options
  const providerConfig = LLM_PROVIDER_CONFIGS[provider]
  const tokenProvider = getLLMTokenProvider(provider)

  // Build token list
  const allTokens = Array.isArray(tokenOrTokens)
    ? tokenOrTokens
    : tokenOrTokens
      ? [tokenOrTokens]
      : []

  // Provider doesn't need auth (e.g., pollinations)
  if (!providerConfig?.needsAuth) {
    try {
      const data = await optimizePromptSingle(options, null)
      return { success: true, data }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      }
    }
  }

  // No tokens and requires auth
  if (allTokens.length === 0) {
    return {
      success: false,
      error: `Please configure your ${provider} token first`,
    }
  }

  // Token rotation loop
  let attempts = 0
  while (attempts < MAX_RETRY_ATTEMPTS) {
    const nextToken = tokenProvider ? getNextAvailableToken(tokenProvider, allTokens) : allTokens[0]

    // All tokens exhausted
    if (!nextToken) {
      return {
        success: false,
        error: 'All API tokens exhausted. Quota will reset tomorrow.',
      }
    }

    try {
      const data = await optimizePromptSingle(options, nextToken)
      return { success: true, data }
    } catch (err) {
      if (isQuotaError(err) && tokenProvider) {
        markTokenExhausted(tokenProvider, nextToken)
        attempts++
        continue
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      }
    }
  }

  return {
    success: false,
    error: 'Maximum retry attempts reached',
  }
}

/**
 * Translate a prompt from Chinese to English
 * Uses Pollinations AI with openai-fast model (free, no auth required)
 */
export async function translatePrompt(prompt: string): Promise<ApiResponse<TranslateResponse>> {
  try {
    const data = await apiRequest<TranslateResponse>(`${API_URL}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    return { success: true, data }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

/**
 * Create video generation task (Gitee only)
 */
export async function createVideoTask(
  options: VideoGenerateRequest,
  token: string
): Promise<ApiResponse<{ taskId: string; status: string }>> {
  try {
    const data = await apiRequest<{ taskId: string; status: string }>(`${API_URL}/api/video/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': token },
      body: JSON.stringify(options),
    })
    return { success: true, data }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

/**
 * Get video task status (Gitee only)
 */
export async function getVideoTaskStatus(
  taskId: string,
  token: string
): Promise<ApiResponse<VideoTaskResponse>> {
  try {
    const data = await apiRequest<VideoTaskResponse>(`${API_URL}/api/video/status/${taskId}`, {
      method: 'GET',
      headers: { 'X-API-Key': token },
    })
    return { success: true, data }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}
