import { Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { playWordAudio } from '@/lib/speech'
import { useAppStore } from '@/store/AppStore'
import { cn } from '@/lib/utils'

interface SpeakerButtonProps {
  text: string
  /** 词条 id：有真人原声时优先播放；缺省时按文本反查，最后回退合成发音 */
  audioId?: string
  size?: 'icon' | 'icon-sm' | 'icon-lg'
  className?: string
}

/** 发音喇叭按钮（真人原声优先）；发音开关关闭时置灰 */
export function SpeakerButton({ text, audioId, size = 'icon', className }: SpeakerButtonProps) {
  const { state } = useAppStore()
  const on = state.settings.soundOn
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={!on}
      aria-label={`播放 ${text} 的发音`}
      className={cn('rounded-full text-primary', className)}
      onClick={(e) => {
        e.stopPropagation()
        playWordAudio(audioId ?? null, text, true)
      }}
    >
      <Volume2 className="size-4" />
    </Button>
  )
}
