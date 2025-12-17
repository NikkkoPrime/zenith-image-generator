import { Globe, Loader2, RotateCcw, Sparkles, Wand2 } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ASPECT_RATIOS, type AspectRatio } from '@/lib/constants'

interface PromptCardProps {
  prompt: string
  negativePrompt: string
  steps: number
  width: number
  height: number
  selectedRatio: string
  uhd: boolean
  loading: boolean
  setPrompt: (v: string) => void
  setNegativePrompt: (v: string) => void
  setSteps: (v: number) => void
  setWidth: (v: number) => void
  setHeight: (v: number) => void
  handleRatioSelect: (ratio: AspectRatio) => void
  handleUhdToggle: (enabled: boolean) => void
  handleGenerate: () => void
  // Prompt optimization/translation
  onOptimize?: () => void
  onTranslate?: () => void
  isOptimizing?: boolean
  isTranslating?: boolean
}

export function PromptCard({
  prompt,
  negativePrompt,
  steps,
  width,
  height,
  selectedRatio,
  uhd,
  loading,
  setPrompt,
  setNegativePrompt,
  setSteps,
  setWidth,
  setHeight,
  handleRatioSelect,
  handleUhdToggle,
  handleGenerate,
  onOptimize,
  onTranslate,
  isOptimizing = false,
  isTranslating = false,
}: PromptCardProps) {
  const isProcessing = isOptimizing || isTranslating

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardContent className="p-5 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-zinc-300 text-sm font-medium">Prompt</Label>
            <div className="flex items-center gap-1">
              {onTranslate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onTranslate}
                  disabled={isProcessing || !prompt.trim()}
                  className="h-7 px-2 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10"
                  title="Translate to English"
                >
                  {isTranslating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Globe className="w-4 h-4" />
                  )}
                  <span className="ml-1 text-xs">Translate</span>
                </Button>
              )}
              {onOptimize && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onOptimize}
                  disabled={isProcessing || !prompt.trim()}
                  className="h-7 px-2 text-zinc-400 hover:text-purple-400 hover:bg-purple-500/10"
                  title="Optimize prompt"
                >
                  {isOptimizing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4" />
                  )}
                  <span className="ml-1 text-xs">Optimize</span>
                </Button>
              )}
            </div>
          </div>
          <Textarea
            rows={8}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image you want to create..."
            className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 resize-none overflow-y-auto max-h-48"
          />
        </div>

        <Accordion type="single" collapsible>
          <AccordionItem value="advanced" className="border-zinc-800">
            <AccordionTrigger className="text-zinc-400 text-sm hover:no-underline py-2">
              Advanced Settings
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pt-2">
                <div>
                  <Label className="text-zinc-400 text-xs">Negative Prompt</Label>
                  <Textarea
                    rows={2}
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    className="mt-1 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 resize-none"
                  />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs flex items-center gap-2">
                    <RotateCcw
                      className="w-3 h-3 cursor-pointer hover:text-orange-400"
                      onClick={() => setSteps(9)}
                    />
                    Inference Steps: <span className="text-orange-400 font-mono">{steps}</span>
                  </Label>
                  <Slider
                    value={[steps]}
                    onValueChange={(v) => setSteps(v[0])}
                    min={1}
                    max={50}
                    step={1}
                    className="mt-2 bg-orange-500"
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-zinc-300 text-sm font-medium">Aspect Ratio</Label>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="uhd" className="text-zinc-400 text-xs">
                  UHD / 2K
                </Label>
                <Switch
                  id="uhd"
                  checked={uhd}
                  className="data-[state=unchecked]:[&>span]:bg-zinc-500 data-[state=checked]:[&>span]:bg-yellow-400"
                  onCheckedChange={handleUhdToggle}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {ASPECT_RATIOS.map((ratio) => {
              const Icon = ratio.icon
              const isSelected = selectedRatio === ratio.label
              return (
                <button
                  type="button"
                  key={ratio.label}
                  onClick={() => handleRatioSelect(ratio)}
                  className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-orange-500/10 border-orange-500 text-orange-400'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{ratio.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-zinc-400 text-xs flex items-center gap-2">
              <RotateCcw
                className="w-3 h-3 cursor-pointer hover:text-orange-400"
                onClick={() => {
                  const ratio = ASPECT_RATIOS.find((r) => r.label === selectedRatio)
                  if (ratio) setWidth(uhd ? ratio.presets[1].w : ratio.presets[0].w)
                }}
              />
              Width: <span className="text-orange-400 font-mono">{width}px</span>
            </Label>
            <Slider
              value={[width]}
              onValueChange={(v) => setWidth(v[0])}
              min={512}
              max={2048}
              step={64}
              className="mt-2 bg-orange-500"
            />
          </div>
          <div>
            <Label className="text-zinc-400 text-xs flex items-center gap-2">
              <RotateCcw
                className="w-3 h-3 cursor-pointer hover:text-orange-400"
                onClick={() => {
                  const ratio = ASPECT_RATIOS.find((r) => r.label === selectedRatio)
                  if (ratio) setHeight(uhd ? ratio.presets[1].h : ratio.presets[0].h)
                }}
              />
              Height: <span className="text-orange-400 font-mono">{height}px</span>
            </Label>
            <Slider
              value={[height]}
              onValueChange={(v) => setHeight(v[0])}
              min={512}
              max={2048}
              step={64}
              className="mt-2 bg-orange-500"
            />
          </div>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold h-12 text-base disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Generate Image
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
