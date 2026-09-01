import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, BookOpenText, Check, PartyPopper, RotateCcw, X } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { SpeakerButton } from '@/components/SpeakerButton'
import { useAppStore } from '@/store/AppStore'
import { SUBJECT_META, WORDS, WORD_BY_ID } from '@/data/words'
import {
  buildExtraNewSession,
  buildPracticeSession,
  buildSession,
  exampleWithBlank,
  getTodayStatus,
  pickReviewDirection,
} from '@/lib/srs'
import { answerText, buildOptions } from '@/lib/quiz'
import { hasUserGestured, playWordAudio } from '@/lib/speech'
import { todayStr } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { AppState, SessionItem } from '@/types'

type Phase = 'quiz' | 'feedback' | 'done'

/** plan：今日计划；new：加餐新学；practice：自由复习（练习，不影响记忆曲线） */
type StudyMode = 'plan' | 'new' | 'practice'

function buildQueue(mode: StudyMode, state: AppState, today: string): SessionItem[] {
  if (mode === 'new') return buildExtraNewSession(state, WORDS)
  if (mode === 'practice') return buildPracticeSession(state, WORDS)
  return buildSession(state, WORDS, today)
}

export default function Study() {
  const { state, dispatch } = useAppStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const mode: StudyMode =
    searchParams.get('mode') === 'new'
      ? 'new'
      : searchParams.get('mode') === 'practice'
        ? 'practice'
        : 'plan'
  const [today, setToday] = useState(todayStr)

  // 会话队列只在进入本页（或点「再来一组」）时按当时状态构建；答错的词追加到队尾重考
  const [queue, setQueue] = useState<SessionItem[]>(() => buildQueue(mode, state, today))
  // 进度条基准：初始队列长度。答错重排队会让 queue 变长，idx/sessionSize 保持单调递增
  const [sessionSize, setSessionSize] = useState(queue.length)
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('quiz')
  const [selected, setSelected] = useState<string | null>(null)
  const [lastCorrect, setLastCorrect] = useState(false)

  const status = getTodayStatus(state, WORDS, today)
  const item: SessionItem | undefined = queue[idx]
  const word = item ? WORD_BY_ID.get(item.wordId) : undefined

  const options = useMemo(
    () => (item && word ? buildOptions(word, WORDS, item.direction) : []),
    [item, word],
  )

  // 例句活用题的挖空例句（抽题时已校验可挖空，此处兜底为 null 时按中→英渲染）
  const blankedExample = useMemo(
    () => (item?.direction === 'ex2en' && word ? exampleWithBlank(word) : null),
    [item, word],
  )

  // 今日任务达成且当天实际答对过题 → 记录完成日期（驱动 streak）；零学习不点亮
  useEffect(() => {
    if (status.done && status.studied && !state.completedDates.includes(today)) {
      dispatch({ type: 'MARK_DAY_DONE', date: today })
    }
  }, [status.done, status.studied, state.completedDates, today, dispatch])

  // 跨午夜：每分钟比对日期，变化时按新日期重建队列（保持当前模式）
  const todayRef = useRef(today)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])
  useEffect(() => {
    const timer = window.setInterval(() => {
      const t = todayStr()
      if (t === todayRef.current) return
      todayRef.current = t
      setToday(t)
      const fresh = buildQueue(mode, stateRef.current, t)
      setQueue(fresh)
      setSessionSize(fresh.length)
      setIdx(0)
      setPhase('quiz')
      setSelected(null)
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [mode])

  // 自动发音：进入新题（英→中）与详情阶段朗读单词；中→英题干不剧透
  // 仅在发生过用户手势后自动发音（iOS Safari / webview 要求 speak 由手势激活，
  // 用户答过一题后必然有手势，之后自动发音即可用）
  useEffect(() => {
    if (!state.settings.soundOn || !item || !word) return
    if (!hasUserGestured()) return
    if (phase === 'quiz' && item.direction === 'en2zh') playWordAudio(word.id, word.word, true)
    else if (phase === 'feedback') playWordAudio(word.id, word.word, true)
  }, [phase, item, word, state.settings.soundOn])

  const goNext = useCallback(() => {
    setSelected(null)
    if (idx + 1 >= queue.length) setPhase('done')
    else {
      setIdx((i) => i + 1)
      setPhase('quiz')
    }
  }, [idx, queue.length])

  // 答对后详情卡短暂停留自动前进；答错则停留，需手动点「下一词」
  useEffect(() => {
    if (phase === 'feedback' && lastCorrect) {
      const t = window.setTimeout(goNext, 4500)
      return () => window.clearTimeout(t)
    }
  }, [phase, lastCorrect, goNext])

  function restartRound() {
    const fresh = buildQueue(mode, stateRef.current, todayRef.current)
    setQueue(fresh)
    setSessionSize(fresh.length)
    setIdx(0)
    setPhase(fresh.length > 0 ? 'quiz' : 'done')
    setSelected(null)
  }

  function applyAnswer(correct: boolean) {
    if (!item) return
    dispatch({
      type: 'ANSWER',
      wordId: item.wordId,
      kind: item.kind,
      correct,
      isRetry: item.isRetry,
    })
    if (!correct) {
      // 重新插入队尾再考一次，标记 isRetry；自由复习仅本轮内重考，不影响记忆曲线
      setQueue((q) => [
        ...q,
        {
          wordId: item.wordId,
          kind: item.kind,
          direction:
            item.kind === 'new' || !word
              ? 'en2zh'
              : pickReviewDirection(state.progress[item.wordId], word),
          isRetry: true,
        },
      ])
    }
  }

  function handleSelect(opt: string) {
    if (selected || !item || !word) return
    const correct = opt === answerText(word, item.direction, WORDS)
    setSelected(opt)
    setLastCorrect(correct)
    applyAnswer(correct)
    window.setTimeout(() => setPhase('feedback'), 1100)
  }

  // —— 空队列 ——
  if (queue.length === 0) {
    if (mode === 'new') {
      return (
        <div className="space-y-5 pt-16 text-center">
          <BookOpenText className="mx-auto size-14 text-muted-foreground" />
          <h1 className="text-xl font-bold">没有更多新词了</h1>
          <p className="text-sm text-muted-foreground">词库已全部学完，去自由复习巩固一下吧</p>
          <div className="flex justify-center gap-3">
            <Button className="rounded-full px-8" onClick={() => navigate('/study?mode=practice')}>
              自由复习
            </Button>
            <Button variant="outline" className="rounded-full px-8" onClick={() => navigate('/')}>
              返回首页
            </Button>
          </div>
        </div>
      )
    }
    if (mode === 'practice') {
      return (
        <div className="space-y-5 pt-16 text-center">
          <BookOpenText className="mx-auto size-14 text-muted-foreground" />
          <h1 className="text-xl font-bold">还没有可复习的单词</h1>
          <p className="text-sm text-muted-foreground">先学习一些新词，之后就能自由复习啦</p>
          <Button className="rounded-full px-8" onClick={() => navigate('/')}>
            返回首页
          </Button>
        </div>
      )
    }
    const celebrated = status.done && status.studied
    if (!celebrated) {
      return (
        <div className="space-y-5 pt-16 text-center">
          <BookOpenText className="mx-auto size-14 text-muted-foreground" />
          <h1 className="text-xl font-bold">今日无待学内容</h1>
          <p className="text-sm text-muted-foreground">
            词库已全部掌握，或今天没有到期的复习内容，去词库逛逛吧
          </p>
          <div className="flex justify-center gap-3">
            <Button className="rounded-full px-8" onClick={() => navigate('/library')}>
              去词库逛逛
            </Button>
            <Button variant="outline" className="rounded-full px-8" onClick={() => navigate('/')}>
              返回首页
            </Button>
          </div>
        </div>
      )
    }
    return (
      <div className="space-y-5 pt-16 text-center">
        <PartyPopper className="mx-auto size-14 text-primary" />
        <h1 className="text-xl font-bold">今日任务已完成 🎉</h1>
        <p className="text-sm text-muted-foreground">
          今天已新学 {status.newDone} 词、复习 {status.reviewDone} 词，明天再来！
        </p>
        <Button className="rounded-full px-8" onClick={() => navigate('/')}>
          返回首页
        </Button>
      </div>
    )
  }

  // —— 本轮完成 ——
  if (phase === 'done' || !item || !word) {
    if (mode !== 'plan') {
      return (
        <div className="space-y-5 pt-16 text-center">
          <PartyPopper className="mx-auto size-14 text-primary" />
          <h1 className="text-2xl font-bold">本轮完成，太棒了！</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'new'
              ? '这组新词已加入记忆曲线，明天起会自动安排复习'
              : '自由复习不影响记忆曲线安排，随时可以再刷一组'}
          </p>
          <div className="flex justify-center gap-3">
            <Button className="rounded-full px-8" onClick={restartRound}>
              <RotateCcw className="size-4" />
              再来一组
            </Button>
            <Button variant="outline" className="rounded-full px-8" onClick={() => navigate('/')}>
              返回首页
            </Button>
          </div>
        </div>
      )
    }
    return (
      <div className="space-y-5 pt-16 text-center">
        <PartyPopper className="mx-auto size-14 text-primary" />
        <h1 className="text-2xl font-bold">今日任务完成，太棒了！</h1>
        <p className="text-sm text-muted-foreground">
          今日新学 {status.newDone} 词 · 复习 {status.reviewDone} 词
        </p>
        <Button className="rounded-full px-8" onClick={() => navigate('/')}>
          返回首页
        </Button>
      </div>
    )
  }

  // —— 学习中：词与四个选项同屏直接展示 ——
  const meta = SUBJECT_META[word.subject]
  const correctAnswer = answerText(word, item.direction, WORDS)
  const kindLabel =
    item.kind === 'new' ? '新词' : item.kind === 'practice' ? '自由复习' : item.isRetry ? '重考' : '复习'

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="返回首页">
              <ArrowLeft className="size-5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>现在退出学习？</AlertDialogTitle>
              <AlertDialogDescription>
                现在退出会重新排列剩余单词，今天已完成的进度会保留。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>继续学习</AlertDialogCancel>
              <AlertDialogAction onClick={() => navigate('/')}>退出</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Progress
          value={sessionSize > 0 ? Math.min(100, (idx / sessionSize) * 100) : 0}
          className="h-2 flex-1"
        />
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          还剩 {queue.length - idx} 个
        </span>
      </div>

      {phase !== 'feedback' && (
        <Card>
          <CardContent className="flex min-h-[180px] flex-col items-center justify-center gap-2 pb-6 pt-8 text-center">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-normal">
                {kindLabel}
              </Badge>
              {item.direction === 'ex2en' && blankedExample && (
                <Badge variant="secondary" className="font-normal">
                  例句题
                </Badge>
              )}
              <Badge variant="outline" className="font-normal">
                <span
                  className="mr-1 inline-block size-2 rounded-full"
                  style={{ background: meta?.color }}
                />
                {meta?.zh ?? word.subject}
              </Badge>
            </div>
            {item.direction === 'en2zh' ? (
              <>
                <div className="mt-2 text-4xl font-bold tracking-wide">{word.word}</div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-sm">{word.ipa}</span>
                  <SpeakerButton text={word.word} audioId={word.id} size="icon-sm" />
                </div>
              </>
            ) : item.direction === 'ex2en' && blankedExample ? (
              <>
                <div className="mt-2 px-2 text-lg font-medium leading-relaxed">
                  {blankedExample}
                </div>
                <div className="text-sm text-muted-foreground">选出例句空格对应的单词</div>
              </>
            ) : (
              <>
                <div className="mt-2 text-3xl font-bold">{word.chinese}</div>
                <div className="text-sm text-muted-foreground">选出对应的英文单词</div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {phase === 'quiz' && (
        <div className="grid grid-cols-1 gap-2.5">
          {options.map((opt) => {
            const isAnswer = opt === correctAnswer
            const isSelected = opt === selected
            return (
              <div key={opt} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    disabled={!!selected}
                    onClick={() => handleSelect(opt)}
                    className={cn(
                      'w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-left text-[15px] transition-all',
                      'hover:border-primary/50 hover:bg-secondary/50 disabled:cursor-default',
                      selected &&
                        isAnswer &&
                        'border-[hsl(var(--success))] bg-[hsl(84_30%_90%)] font-medium text-[hsl(80_30%_25%)]',
                      selected &&
                        isSelected &&
                        !isAnswer &&
                        'border-destructive bg-[hsl(8_45%_92%)] text-destructive',
                      selected && !isAnswer && !isSelected && 'opacity-50',
                    )}
                  >
                    {opt}
                  </button>
                </div>
                {(item.direction === 'zh2en' || item.direction === 'ex2en') && (
                  <SpeakerButton text={opt} size="icon-sm" className="shrink-0" />
                )}
              </div>
            )
          })}
        </div>
      )}

      {phase === 'feedback' && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between">
              {lastCorrect ? (
                <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] hover:bg-[hsl(var(--success))]">
                  <Check className="size-3.5" />
                  答对啦
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <X className="size-3.5" />
                  答错了
                </Badge>
              )}
              <SpeakerButton text={word.word} audioId={word.id} size="icon-sm" />
            </div>
            {!lastCorrect && (
              <p className="text-sm text-muted-foreground">正确答案：{correctAnswer}</p>
            )}
            <div>
              <span className="text-2xl font-bold">{word.word}</span>
              <span className="ml-2 text-sm text-muted-foreground">{word.ipa}</span>
            </div>
            <div className="text-lg font-medium">{word.chinese}</div>
            <p className="text-sm leading-relaxed text-muted-foreground">{word.definition_en}</p>
            <div className="space-y-1 rounded-xl bg-secondary/60 px-4 py-3">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm leading-relaxed">{word.example_en}</p>
                <SpeakerButton
                  text={word.example_en}
                  size="icon-sm"
                  className="size-7 shrink-0"
                />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{word.example_zh}</p>
            </div>
            {!lastCorrect && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <RotateCcw className="size-3.5" />
                {item.kind === 'practice' ? '已安排本轮稍后再考一次' : '已安排在今天稍后再考一次'}
              </p>
            )}
            <Button className="h-11 w-full rounded-full" onClick={goNext}>
              下一词
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
