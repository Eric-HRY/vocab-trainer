import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { BookOpenText, LibraryBig, PartyPopper, RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ProgressRing } from '@/components/ProgressRing'
import { Heatmap } from '@/components/Heatmap'
import { useAppStore } from '@/store/AppStore'
import { SUBJECT_META, SUBJECT_ORDER, WORDS } from '@/data/words'
import { getHeatmap, getProgressStats, getStreak, getSubjectStats, getTodayStatus, getTotals } from '@/lib/srs'
import { todayCN, todayStr } from '@/lib/dates'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function pct(done: number, target: number): number {
  return target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 100
}

export default function Home() {
  const { state, dispatch } = useAppStore()
  const navigate = useNavigate()
  // 跨午夜：每分钟比对日期，变化时触发重渲染刷新今日状态
  const [today, setToday] = useState(todayStr)
  useEffect(() => {
    const timer = window.setInterval(() => {
      const t = todayStr()
      setToday((prev) => (t === prev ? prev : t))
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const status = useMemo(() => getTodayStatus(state, WORDS, today), [state, today])
  const streak = useMemo(() => getStreak(state, today), [state, today])
  const totals = useMemo(() => getTotals(state, WORDS), [state])
  const progressStats = useMemo(() => getProgressStats(state, WORDS), [state])
  const subjects = useMemo(() => getSubjectStats(state, WORDS), [state])
  const heat = useMemo(() => getHeatmap(state, today), [state, today])

  const subjectsSorted = [...subjects].sort(
    (a, b) => SUBJECT_ORDER.indexOf(a.subject) - SUBJECT_ORDER.indexOf(b.subject),
  )
  const started = status.newDone + status.reviewDone > 0

  return (
    <div className="space-y-5">
      {!state.onboarded && (
        <Card className="border-primary/30 bg-secondary/60">
          <CardContent className="flex items-start gap-3 pt-5">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
            <p className="flex-1 text-sm leading-relaxed">
              欢迎来到啸啸单词斩！每天点「开始学习」，先学新词、再复习到期的词。
              系统会按艾宾浩斯记忆曲线（1/2/4/7/15/30 天）自动安排复习，坚持打卡就能把
              {WORDS.length} 个学科词全部拿下。
              <Button
                size="sm"
                variant="outline"
                className="ml-2 rounded-full"
                onClick={() => dispatch({ type: 'SET_ONBOARDED' })}
              >
                知道了
              </Button>
            </p>
          </CardContent>
        </Card>
      )}

      <div>
        <h1 className="text-2xl font-bold">{greeting()}，啸啸 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">{todayCN()}</p>
      </div>

      {status.done && status.studied ? (
        <Card className="text-center">
          <CardContent className="space-y-3 py-10">
            <PartyPopper className="mx-auto size-12 text-primary" />
            <div className="text-xl font-bold">今日任务全部完成，太棒了！</div>
            <p className="text-sm text-muted-foreground">
              今天新学 {status.newDone} 词 · 复习 {status.reviewDone} 词，明天再来巩固哦～
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                className="rounded-full"
                disabled={status.unlearnedLeft === 0}
                onClick={() => navigate('/study?mode=new')}
              >
                <BookOpenText className="size-4" />
                新学更多单词
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                disabled={totals.learned === 0}
                onClick={() => navigate('/study?mode=practice')}
              >
                <RotateCcw className="size-4" />
                自由复习
              </Button>
              <Button variant="outline" className="rounded-full" onClick={() => navigate('/library')}>
                去词库逛逛
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">自由复习不影响记忆曲线安排</p>
          </CardContent>
        </Card>
      ) : !status.hasWork ? (
        <Card className="text-center">
          <CardContent className="space-y-3 py-10">
            <LibraryBig className="mx-auto size-12 text-muted-foreground" />
            <div className="text-xl font-bold">今日无待学内容</div>
            <p className="text-sm text-muted-foreground">
              词库已全部掌握，或今天没有到期的复习内容，去词库逛逛吧
            </p>
            <Button variant="outline" className="rounded-full" onClick={() => navigate('/library')}>
              去词库逛逛
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">今日任务</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1.5 flex justify-between text-sm">
                <span>新词</span>
                <span className="text-muted-foreground">
                  {status.newDone}/{status.newTarget}
                </span>
              </div>
              <Progress value={pct(status.newDone, status.newTarget)} className="h-2.5" />
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-sm">
                <span>复习</span>
                <span className="text-muted-foreground">
                  {status.reviewDone}/{status.reviewTarget}
                </span>
              </div>
              <Progress value={pct(status.reviewDone, status.reviewTarget)} className="h-2.5" />
            </div>
            <Button
              className="h-11 w-full rounded-full text-base"
              onClick={() => navigate('/study')}
            >
              <BookOpenText className="size-5" />
              {started ? '继续学习' : '开始学习'}
            </Button>
            <div className="grid grid-cols-2 gap-2.5">
              <Button
                variant="outline"
                className="h-10 rounded-full"
                disabled={status.unlearnedLeft === 0}
                onClick={() => navigate('/study?mode=new')}
              >
                <BookOpenText className="size-4" />
                新学
              </Button>
              <Button
                variant="outline"
                className="h-10 rounded-full"
                disabled={totals.learned === 0}
                onClick={() => navigate('/study?mode=practice')}
              >
                <RotateCcw className="size-4" />
                复习
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              计划外可随时「新学」加餐、「复习」不限次刷题（自由复习不影响记忆曲线）
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">学习进度</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-6">
            <ProgressRing value={totals.total ? totals.learned / totals.total : 0}>
              <div className="text-2xl font-bold leading-none">{totals.learned}</div>
              <div className="mt-1 text-xs text-muted-foreground">/ {totals.total} 已刷过</div>
            </ProgressRing>
            <div className="grid flex-1 grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-xl font-bold text-primary">{streak}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">连续天数</div>
              </div>
              <div>
                <div className="text-xl font-bold">{progressStats.proficient}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">相对熟练</div>
              </div>
              <div>
                <div className="text-xl font-bold">{progressStats.errorProne}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">易错词</div>
              </div>
              <div>
                <div className="text-xl font-bold">{totals.total - totals.learned}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">未学</div>
              </div>
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span>学习进度（已刷过）</span>
              <span className="text-muted-foreground">
                {progressStats.learned}/{progressStats.total}
              </span>
            </div>
            <Progress
              value={pct(progressStats.learned, progressStats.total)}
              className="h-2.5"
            />
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span>复习进度（相对熟练）</span>
              <span className="text-muted-foreground">
                {progressStats.proficient}/{progressStats.learned}
              </span>
            </div>
            <Progress
              value={pct(progressStats.proficient, progressStats.learned)}
              className="h-2.5"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              熟练度依据记忆曲线复习轮次与累计答错次数计算；易错词为累计答错 ≥ 2 次的单词
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">学科掌握</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3.5">
          {subjectsSorted.map((s) => {
            const meta = SUBJECT_META[s.subject]
            const p = s.total > 0 ? Math.round((s.mastered / s.total) * 100) : 0
            return (
              <div key={s.subject}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ background: meta?.color }}
                    />
                    {meta?.zh ?? s.subject}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {s.mastered}/{s.total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${p}%`, background: meta?.color }}
                  />
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">近 30 天</CardTitle>
        </CardHeader>
        <CardContent>
          <Heatmap days={heat} />
        </CardContent>
      </Card>
    </div>
  )
}
