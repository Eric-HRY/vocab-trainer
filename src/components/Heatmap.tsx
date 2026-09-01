import type { HeatDay } from '@/lib/srs'
import { formatCN } from '@/lib/dates'

/** 焦糖色系由浅到深 */
const LEVELS = [
  'hsl(42 22% 91%)',
  'hsl(30 42% 82%)',
  'hsl(28 44% 68%)',
  'hsl(26 46% 54%)',
  'hsl(24 50% 42%)',
]

function levelOf(count: number): number {
  if (count <= 0) return 0
  if (count < 15) return 1
  if (count < 30) return 2
  if (count < 50) return 3
  return 4
}

/** 近 30 天学习热力小日历 */
export function Heatmap({ days }: { days: HeatDay[] }) {
  return (
    <div>
      {days.length > 0 && (
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatCN(days[0].date)}</span>
          <span>{formatCN(days[days.length - 1].date)}</span>
        </div>
      )}
      <div className="grid grid-cols-10 gap-1.5">
        {days.map((d) => (
          <div
            key={d.date}
            title={`${formatCN(d.date)} · 学习 ${d.count} 词`}
            className="aspect-square rounded-[4px] transition-transform hover:scale-110"
            style={{ background: LEVELS[levelOf(d.count)] }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-end gap-1 text-xs text-muted-foreground">
        <span className="mr-1">少</span>
        {LEVELS.map((c) => (
          <span
            key={c}
            className="inline-block size-2.5 rounded-[3px]"
            style={{ background: c }}
          />
        ))}
        <span className="ml-1">多</span>
      </div>
    </div>
  )
}
