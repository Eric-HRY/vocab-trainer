import type { AppState, QuizDirection, SessionItem, Word, WordProgress } from '@/types'
import { addDays } from '@/lib/dates'

/** 艾宾浩斯间隔：stage 0-5 分别对应 1/2/4/7/15/30 天 */
export const STAGE_INTERVALS = [1, 2, 4, 7, 15, 30] as const
export const MAX_STAGE = 5

/** 复习达到该 stage 视为「相对熟练」（间隔 ≥ 7 天档） */
export const PROFICIENT_STAGE = 3
/** 复习达到该 stage 后可出例句活用题 */
export const EXAMPLE_QUIZ_STAGE = 2
/** 满足条件时例句题的出现概率 */
export const EXAMPLE_QUIZ_RATE = 0.4
/** 累计答错达到该次数视为「易错词」 */
export const ERROR_PRONE_WRONGS = 2

/** 新词学会：进入 stage 0，第 1 天后首次复习 */
export function newWordProgress(today: string): WordProgress {
  return { stage: 0, dueDate: addDays(today, STAGE_INTERVALS[0]), learnedAt: today }
}

/** 答对：升 stage，到期日顺延到下一间隔 */
export function advanceProgress(p: WordProgress, today: string): WordProgress {
  const stage = Math.min(p.stage + 1, MAX_STAGE)
  return { ...p, stage, dueDate: addDays(today, STAGE_INTERVALS[stage]) }
}

/** 答错：降回 stage 0，当天重新排队 */
export function resetProgress(p: WordProgress, today: string): WordProgress {
  return { ...p, stage: 0, dueDate: today }
}

/**
 * 复习作答统一结算：
 * - 答错：降回 stage 0、当天到期（由会话层重排队）
 * - 重考答对（isRetry）：stage 保持 0，dueDate = 今天 + 1 天，不直接升档
 * - 正常复习答对：stage + 1，顺延下一间隔
 * 三种情况都记录 lastResult / lastAnswered，供重建队列时识别「今天刚答错过」
 */
export function settleReviewAnswer(
  p: WordProgress,
  today: string,
  correct: boolean,
  isRetry: boolean,
): WordProgress {
  if (!correct) {
    return { ...resetProgress(p, today), lastResult: 'wrong', lastAnswered: today }
  }
  if (isRetry) {
    return {
      ...p,
      stage: 0,
      dueDate: addDays(today, STAGE_INTERVALS[0]),
      lastResult: 'correct',
      lastAnswered: today,
    }
  }
  return { ...advanceProgress(p, today), lastResult: 'correct', lastAnswered: today }
}

export function isDue(p: WordProgress | undefined, today: string): boolean {
  return !!p && p.stage < MAX_STAGE && p.dueDate <= today
}

/** 到期复习词（按到期日升序，最久逾期在前） */
export function getDueReviewIds(state: AppState, words: Word[], today: string): string[] {
  return words
    .filter((w) => isDue(state.progress[w.id], today))
    .sort((a, b) => {
      const da = state.progress[a.id]?.dueDate ?? ''
      const db = state.progress[b.id]?.dueDate ?? ''
      return da < db ? -1 : da > db ? 1 : 0
    })
    .map((w) => w.id)
}

/** 未学词（保持词库原始顺序） */
export function getUnlearnedIds(state: AppState, words: Word[]): string[] {
  return words.filter((w) => !state.progress[w.id]).map((w) => w.id)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 把例句中的目标词挖空（大小写不敏感、含复数等简单变形）。
 * 例句里找不到该词时返回 null，调用方应回退到普通选词题。
 */
export function exampleWithBlank(word: Word): string | null {
  const ex = word.example_en?.trim()
  if (!ex) return null
  const head = word.word.replace(/[（(].*?[)）]/g, '').trim()
  const candidates = [...new Set([word.word.trim(), head].filter(Boolean))]
  for (const c of candidates) {
    const stem = escapeRegExp(c)
    // 允许词尾简单变形（s/es/ing/ed），避免「Pharaohs」这类复数挖不到
    const re = new RegExp(`${stem}(?:s|es|ing|ed)?\\b`, 'gi')
    if (re.test(ex)) return ex.replace(re, '______')
  }
  return null
}

/**
 * 复习/练习题的出题方向：
 * 复习满 EXAMPLE_QUIZ_STAGE 轮且例句可挖空时，按概率出例句活用题；
 * 其余英→中 / 中→英 各半。
 */
export function pickReviewDirection(p: WordProgress | undefined, word: Word): QuizDirection {
  if (
    p &&
    p.stage >= EXAMPLE_QUIZ_STAGE &&
    Math.random() < EXAMPLE_QUIZ_RATE &&
    exampleWithBlank(word)
  ) {
    return 'ex2en'
  }
  return Math.random() < 0.5 ? 'en2zh' : 'zh2en'
}

export interface TodayStatus {
  newDone: number
  newTarget: number
  reviewDone: number
  reviewTarget: number
  newLeft: number
  dueLeft: number
  unlearnedLeft: number
  /** 今天是否安排了任务（含已完成）：无待学内容时为 false */
  hasWork: boolean
  /** 今天是否实际答对过题（新学或复习）：零学习不点亮 streak */
  studied: boolean
  done: boolean
}

/** 今日任务状态：到期复习 + 新词配额 */
export function getTodayStatus(state: AppState, words: Word[], today: string): TodayStatus {
  const day = state.days[today]
  const newDone = day?.newIds.length ?? 0
  const reviewDone = day?.reviewIds.length ?? 0
  const dueLeft = getDueReviewIds(state, words, today).length
  const unlearnedLeft = getUnlearnedIds(state, words).length
  // 中途调低配额时目标不得小于已完成数，避免显示错位
  const newTarget = Math.max(newDone, Math.min(state.settings.dailyNew, newDone + unlearnedLeft))
  const newLeft = Math.max(0, newTarget - newDone)
  const reviewTarget = reviewDone + dueLeft
  return {
    newDone,
    newTarget,
    reviewDone,
    reviewTarget,
    newLeft,
    dueLeft,
    unlearnedLeft,
    hasWork: newTarget > 0 || reviewTarget > 0,
    studied: newDone + reviewDone > 0,
    done: newLeft === 0 && dueLeft === 0,
  }
}

/** 构建一次学习会话队列：先新词（英→中），后复习（含例句活用题的概率抽选） */
export function buildSession(state: AppState, words: Word[], today: string): SessionItem[] {
  const status = getTodayStatus(state, words, today)
  const byId = new Map(words.map((w) => [w.id, w]))
  const news = getUnlearnedIds(state, words)
    .slice(0, status.newLeft)
    .map((wordId): SessionItem => ({ wordId, kind: 'new', direction: 'en2zh' }))
  const reviews = getDueReviewIds(state, words, today).map((wordId): SessionItem => {
    const p = state.progress[wordId]
    const w = byId.get(wordId)
    // 今天刚答错过的词重建队列时仍按重考处理：答对按 stage 0 结算
    const isRetry = p?.lastResult === 'wrong' && p?.lastAnswered === today
    return {
      wordId,
      kind: 'review',
      direction: w ? pickReviewDirection(p, w) : Math.random() < 0.5 ? 'en2zh' : 'zh2en',
      ...(isRetry ? { isRetry: true } : {}),
    }
  })
  return [...news, ...reviews]
}

/** 加餐新学：今日计划之外继续学新词，默认一组 10 个（正常进入记忆曲线） */
export function buildExtraNewSession(state: AppState, words: Word[], n = 10): SessionItem[] {
  return getUnlearnedIds(state, words)
    .slice(0, n)
    .map((wordId): SessionItem => ({ wordId, kind: 'new', direction: 'en2zh' }))
}

/**
 * 自由复习：从已学过的词里随机抽 n 个（含今天和此前学过的）。
 * 练习模式：答题不改动记忆曲线的 stage / dueDate；每次调用重新随机，可无限次刷题。
 */
export function buildPracticeSession(state: AppState, words: Word[], n = 10): SessionItem[] {
  const learned = words.filter((w) => state.progress[w.id])
  for (let i = learned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[learned[i], learned[j]] = [learned[j], learned[i]]
  }
  return learned
    .slice(0, n)
    .map((w): SessionItem => ({
      wordId: w.id,
      kind: 'practice',
      direction: pickReviewDirection(state.progress[w.id], w),
    }))
}

/** 连续学习天数：今天未完成则从前一天往前数，不中断 */
export function getStreak(state: AppState, today: string): number {
  const done = new Set(state.completedDates)
  let cursor = today
  if (!done.has(cursor)) cursor = addDays(cursor, -1)
  let streak = 0
  while (done.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

export interface HeatDay {
  date: string
  count: number
}

/** 近 30 天学习热力（新学 + 复习词数） */
export function getHeatmap(state: AppState, today: string, days = 30): HeatDay[] {
  const out: HeatDay[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    const rec = state.days[date]
    out.push({ date, count: (rec?.newIds.length ?? 0) + (rec?.reviewIds.length ?? 0) })
  }
  return out
}

export interface SubjectStat {
  subject: string
  total: number
  learned: number
  mastered: number
}

export function getSubjectStats(state: AppState, words: Word[]): SubjectStat[] {
  const map = new Map<string, SubjectStat>()
  for (const w of words) {
    let s = map.get(w.subject)
    if (!s) {
      s = { subject: w.subject, total: 0, learned: 0, mastered: 0 }
      map.set(w.subject, s)
    }
    s.total += 1
    const p = state.progress[w.id]
    if (p) {
      s.learned += 1
      if (p.stage >= MAX_STAGE) s.mastered += 1
    }
  }
  return [...map.values()]
}

export function getTotals(state: AppState, words: Word[]) {
  let learned = 0
  let mastered = 0
  for (const w of words) {
    const p = state.progress[w.id]
    if (p) {
      learned += 1
      if (p.stage >= MAX_STAGE) mastered += 1
    }
  }
  return { total: words.length, learned, mastered }
}

export interface ProgressStats {
  total: number
  /** 已刷过（有学习记录）的词数 */
  learned: number
  /** 相对熟练：记忆曲线 stage ≥ PROFICIENT_STAGE */
  proficient: number
  /** 易错词：累计答错 ≥ ERROR_PRONE_WRONGS 次 */
  errorProne: number
  /** 已学词的平均记忆阶段（0-1），熟练度的连续口径 */
  avgStageRatio: number
}

/** 学习进度总览：学习进度（已刷过）+ 复习进度（相对熟练，依据记忆阶段与答错次数） */
export function getProgressStats(state: AppState, words: Word[]): ProgressStats {
  let learned = 0
  let proficient = 0
  let errorProne = 0
  let stageSum = 0
  for (const w of words) {
    const p = state.progress[w.id]
    if (!p) continue
    learned += 1
    stageSum += p.stage
    if (p.stage >= PROFICIENT_STAGE) proficient += 1
    if ((p.wrongCount ?? 0) >= ERROR_PRONE_WRONGS) errorProne += 1
  }
  return {
    total: words.length,
    learned,
    proficient,
    errorProne,
    avgStageRatio: learned > 0 ? stageSum / (learned * MAX_STAGE) : 0,
  }
}
