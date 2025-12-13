import { Handle, type NodeProps, Position } from '@xyflow/react'
import { Download, Loader2, AlertCircle, ZoomIn } from 'lucide-react'
import { memo, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImageData } from '@/stores/flowStore'
import { useFlowStore } from '@/stores/flowStore'
import { loadSettings, type ProviderType, getModelsByProvider, getDefaultModel } from '@/lib/constants'
import { loadAllTokens } from '@/lib/crypto'
import type { ImageDetails } from '@z-image/shared'

interface ImageNodeProps extends NodeProps {
  data: ImageData
}

interface GenerateApiResponse {
  error?: string
  imageDetails?: ImageDetails
}

async function generateImageApi(
  prompt: string,
  width: number,
  height: number,
  provider: ProviderType,
  token: string,
  model: string,
  seed: number
): Promise<ImageDetails> {
  const baseUrl = import.meta.env.VITE_API_URL || ''
  const { PROVIDER_CONFIGS } = await import('@/lib/constants')
  const providerConfig = PROVIDER_CONFIGS[provider]

  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { [providerConfig.authHeader]: token }),
    },
    body: JSON.stringify({
      provider,
      prompt,
      model,
      width,
      height,
      steps: 9,
      seed,
    }),
  })

  const text = await res.text()
  if (!text) throw new Error('Empty response from server')

  let data: GenerateApiResponse
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Invalid response: ${text.slice(0, 100)}`)
  }

  if (!res.ok) throw new Error(data.error || 'Failed to generate')
  if (!data.imageDetails) throw new Error('No image details returned')
  return data.imageDetails
}

function ImageNodeComponent({ id, data }: ImageNodeProps) {
  const { t } = useTranslation()
  const { prompt, width, height, seed, imageUrl, duration, isLoading, error } = data
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef(0)
  const generatingRef = useRef(false)

  const updateImageGenerated = useFlowStore((s) => s.updateImageGenerated)
  const updateImageError = useFlowStore((s) => s.updateImageError)
  const setLightboxImage = useFlowStore((s) => s.setLightboxImage)
  const hasHydrated = useFlowStore((s) => s._hasHydrated)

  // Timer for elapsed time during generation
  useEffect(() => {
    if (!isLoading) return
    startTimeRef.current = Date.now()
    const interval = setInterval(() => {
      setElapsed((Date.now() - startTimeRef.current) / 1000)
    }, 100)
    return () => clearInterval(interval)
  }, [isLoading])

  // Generate image on mount (only after hydration)
  useEffect(() => {
    if (!hasHydrated) return // Wait for store hydration
    if (imageUrl || !isLoading) return
    if (generatingRef.current) return
    generatingRef.current = true

    ;(async () => {
      const settings = loadSettings()
      const provider = (settings.provider as ProviderType) ?? 'huggingface'

      // Validate model
      const validModels = getModelsByProvider(provider)
      const savedModel = settings.model || 'z-image-turbo'
      const selectedModel = validModels.some((m) => m.id === savedModel)
        ? savedModel
        : getDefaultModel(provider)

      const tokens = await loadAllTokens()
      const token = tokens[provider]

      const { PROVIDER_CONFIGS } = await import('@/lib/constants')
      if (PROVIDER_CONFIGS[provider].requiresAuth && !token) {
        updateImageError(id, 'No API Token')
        return
      }

      try {
        const imageDetails = await generateImageApi(
          prompt,
          width,
          height,
          provider,
          token,
          selectedModel,
          seed
        )
        updateImageGenerated(id, imageDetails.url, imageDetails.duration)
      } catch (err) {
        updateImageError(id, err instanceof Error ? err.message : 'Failed to generate')
      }
    })()
  }, [id, prompt, width, height, seed, imageUrl, isLoading, hasHydrated, updateImageGenerated, updateImageError])

  const handleDownload = async () => {
    if (!imageUrl) return
    const { downloadImage } = await import('@/lib/utils')
    await downloadImage(imageUrl, `zenith-${Date.now()}.png`)
  }

  const handleDoubleClick = () => {
    if (imageUrl) {
      setLightboxImage(id)
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: React Flow node with double-click handler
    <div
      className="relative rounded-xl overflow-hidden bg-zinc-900 border border-zinc-700 w-[256px] h-[256px] group cursor-pointer"
      onDoubleClick={handleDoubleClick}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-zinc-600 !border-2 !border-zinc-500"
      />

      {isLoading ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800">
          <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-3" />
          <span className="text-zinc-400 font-mono text-lg">{elapsed.toFixed(1)}s</span>
          <span className="text-zinc-600 text-xs mt-1">{t('prompt.generating')}</span>
        </div>
      ) : error ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800 p-4">
          <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
          <span className="text-red-400 text-sm text-center">{error}</span>
        </div>
      ) : imageUrl ? (
        <>
          <img
            src={imageUrl}
            alt="Generated"
            className="w-full h-full object-cover"
          />

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
            <ZoomIn className="w-8 h-8 text-white" />
            <span className="text-xs text-zinc-300">{t('flow.doubleClickEnlarge')}</span>

            {/* Download button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleDownload()
              }}
              className="absolute bottom-3 right-3 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <Download size={16} />
            </button>
          </div>

          {/* Duration badge */}
          {duration && (
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-[10px] text-zinc-300">
              {duration}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

export const ImageNode = memo(ImageNodeComponent)
export default ImageNode
