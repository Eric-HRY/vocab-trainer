import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SpeakerButton } from '@/components/SpeakerButton'
import { useAppStore } from '@/store/AppStore'
import { SUBJECT_META, SUBJECT_ORDER, WORDS } from '@/data/words'
import { MAX_STAGE } from '@/lib/srs'
import { formatCN, todayStr } from '@/lib/dates'
import { cn } from '@/lib/utils'

type StatusKey = '未学' | '学习中' | '已掌握'

function statusKeyOf(p: { stage: number } | undefined): StatusKey {
  if (!p) return '未学'
  return p.stage >= MAX_STAGE ? '已掌握' : '学习中'
}

export default function Library() {
  const { state } = useAppStore()
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState('全部')
  const [statusFilter, setStatusFilter] = useState<StatusKey | '全部'>('全部')
  const today = todayStr()

  const subjectCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of WORDS) m.set(w.subject, (m.get(w.subject) ?? 0) + 1)
    return m
  }, [])

  const statusCounts = useMemo(() => {
    const m = new Map<StatusKey, number>([
      ['未学', 0],
      ['学习中', 0],
      ['已掌握', 0],
    ])
    for (const w of WORDS) {
      const k = statusKeyOf(state.progress[w.id])
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [state.progress])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return WORDS.filter((w) => {
      if (subject !== '全部' && w.subject !== subject) return false
      if (statusFilter !== '全部' && statusKeyOf(state.progress[w.id]) !== statusFilter)
        return false
      if (!q) return true
      return w.word.toLowerCase().includes(q) || w.chinese.includes(query.trim())
    })
  }, [query, subject, statusFilter, state.progress])

  function statusOf(id: string): { label: string; className: string } {
    const p = state.progress[id]
    if (!p) return { label: '未学', className: 'bg-muted text-muted-foreground' }
    if (p.stage >= MAX_STAGE)
      return {
        label: '已掌握',
        className: 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]',
      }
    const due = p.dueDate <= today ? '今天待复习' : `${formatCN(p.dueDate)}复习`
    return { label: `学习中 · ${due}`, className: 'bg-secondary text-secondary-foreground' }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">词库</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索英文单词或中文释义"
          className="rounded-full bg-card pl-9"
        />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {['全部', ...SUBJECT_ORDER].map((s) => {
          const active = subject === s
          const meta = s === '全部' ? undefined : SUBJECT_META[s]
          const count = s === '全部' ? WORDS.length : (subjectCounts.get(s) ?? 0)
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSubject(s)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40',
              )}
            >
              {meta && (
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ background: active ? 'currentColor' : meta.color }}
                />
              )}
              {s === '全部' ? '全部' : meta?.zh}
              <span className="text-xs opacity-70">{count}</span>
            </button>
          )
        })}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(['全部', '未学', '学习中', '已掌握'] as const).map((s) => {
          const active = statusFilter === s
          const count = s === '全部' ? WORDS.length : (statusCounts.get(s) ?? 0)
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40',
              )}
            >
              {s}
              <span className="text-xs opacity-70">{count}</span>
            </button>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">共 {filtered.length} 词</p>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            没有匹配的单词，换个关键词试试
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((w) => {
            const meta = SUBJECT_META[w.subject]
            const st = statusOf(w.id)
            return (
              <Card key={w.id}>
                <CardContent className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{w.word}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{w.ipa}</span>
                      <SpeakerButton text={w.word} audioId={w.id} size="icon-sm" className="size-6 shrink-0" />
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <span
                        className="inline-block size-2 shrink-0 rounded-full"
                        style={{ background: meta?.color }}
                      />
                      <span className="truncate">{w.chinese}</span>
                    </div>
                  </div>
                  <span
                    className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs', st.className)}
                  >
                    {st.label}
                  </span>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
