import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import type { Dispatch, ReactNode } from 'react'
import type { AppState, DayRecord, SessionKind, WordProgress } from '@/types'
import { newWordProgress, settleReviewAnswer } from '@/lib/srs'
import { todayStr } from '@/lib/dates'

const STORAGE_KEY = 'xiaoxiao-vocab-zhan-v1'

export type Action =
  | { type: 'ANSWER'; wordId: string; kind: SessionKind; correct: boolean; isRetry?: boolean }
  | { type: 'MARK_DAY_DONE'; date: string }
  | { type: 'SET_DAILY_NEW'; value: number }
  | { type: 'SET_SOUND'; value: boolean }
  | { type: 'SET_ONBOARDED' }
  | { type: 'RESET_ALL' }

const initialState: AppState = {
  progress: {},
  days: {},
  completedDates: [],
  settings: { dailyNew: 20, soundOn: true },
  onboarded: false,
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function isValidProgress(v: unknown): v is WordProgress {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  if (typeof o.stage !== 'number' || !Number.isInteger(o.stage) || o.stage < 0 || o.stage > 5)
    return false
  if (typeof o.dueDate !== 'string' || !DATE_RE.test(o.dueDate)) return false
  if (typeof o.learnedAt !== 'string' || !DATE_RE.test(o.learnedAt)) return false
  if (o.lastResult !== undefined && o.lastResult !== 'correct' && o.lastResult !== 'wrong')
    return false
  if (
    o.lastAnswered !== undefined &&
    (typeof o.lastAnswered !== 'string' || !DATE_RE.test(o.lastAnswered))
  )
    return false
  if (
    o.wrongCount !== undefined &&
    (typeof o.wrongCount !== 'number' || !Number.isInteger(o.wrongCount) || o.wrongCount < 0)
  )
    return false
  if (
    o.correctCount !== undefined &&
    (typeof o.correctCount !== 'number' || !Number.isInteger(o.correctCount) || o.correctCount < 0)
  )
    return false
  return true
}

function isValidDay(v: unknown): v is DayRecord {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  return isStringArray(o.newIds) && isStringArray(o.reviewIds)
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** 结构损坏时把原始串备份到 -corrupted key，便于事后恢复 */
function backupCorrupted(raw: string) {
  try {
    localStorage.setItem(`${STORAGE_KEY}-corrupted`, raw)
  } catch {
    // 备份失败不影响降级
  }
}

function loadState(): AppState {
  let rawText: string | null = null
  try {
    rawText = localStorage.getItem(STORAGE_KEY)
    if (!rawText) return initialState
    const parsed: unknown = JSON.parse(rawText)
    const p = parsed as Partial<AppState>
    const valid =
      isPlainRecord(parsed) &&
      (p.progress === undefined ||
        (isPlainRecord(p.progress) && Object.values(p.progress).every(isValidProgress))) &&
      (p.days === undefined ||
        (isPlainRecord(p.days) &&
          Object.entries(p.days).every(([k, v]) => DATE_RE.test(k) && isValidDay(v)))) &&
      (p.completedDates === undefined || isStringArray(p.completedDates))
    if (!valid) {
      backupCorrupted(rawText)
      return initialState
    }
    return {
      ...initialState,
      ...p,
      settings: {
        ...initialState.settings,
        ...(isPlainRecord(p.settings) ? p.settings : {}),
      },
    }
  } catch {
    if (rawText) backupCorrupted(rawText)
    return initialState
  }
}

function emptyDay(): DayRecord {
  return { newIds: [], reviewIds: [] }
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ANSWER': {
      const today = todayStr()
      const day = state.days[today] ?? emptyDay()

      // 自由复习（练习模式）：完全不写入进度与每日记录，避免打乱记忆曲线
      if (action.kind === 'practice') return state

      if (action.kind === 'new') {
        // 新词：答错不入库（由会话层重新排队）；答对才建立进度
        if (!action.correct) return state
        if (state.progress[action.wordId]) return state
        const progress = {
          ...state.progress,
          [action.wordId]: { ...newWordProgress(today), lastResult: 'correct' as const, lastAnswered: today },
        }
        const newIds = day.newIds.includes(action.wordId)
          ? day.newIds
          : [...day.newIds, action.wordId]
        return { ...state, progress, days: { ...state.days, [today]: { ...day, newIds } } }
      }

      // 复习：正常答对升 stage；重考答对按 stage 0 结算；答错降回 stage 0 且今天到期
      const cur = state.progress[action.wordId]
      if (!cur) return state
      const settled = settleReviewAnswer(cur, today, action.correct, action.isRetry === true)
      // 累计答对/答错次数：作为熟练度与易错词的依据（自由复习已在上方拦截）
      const next = {
        ...settled,
        wrongCount: (cur.wrongCount ?? 0) + (action.correct ? 0 : 1),
        correctCount: (cur.correctCount ?? 0) + (action.correct ? 1 : 0),
      }
      const progress = { ...state.progress, [action.wordId]: next }
      let days = state.days
      if (action.correct && !day.reviewIds.includes(action.wordId)) {
        days = { ...state.days, [today]: { ...day, reviewIds: [...day.reviewIds, action.wordId] } }
      }
      return { ...state, progress, days }
    }

    case 'MARK_DAY_DONE': {
      if (state.completedDates.includes(action.date)) return state
      return { ...state, completedDates: [...state.completedDates, action.date] }
    }

    case 'SET_DAILY_NEW':
      return { ...state, settings: { ...state.settings, dailyNew: action.value } }

    case 'SET_SOUND':
      return { ...state, settings: { ...state.settings, soundOn: action.value } }

    case 'SET_ONBOARDED':
      return { ...state, onboarded: true }

    case 'RESET_ALL':
      // 保留设置与引导标记，清空全部学习进度
      return { ...initialState, settings: state.settings, onboarded: true }

    default:
      return state
  }
}

interface StoreValue {
  state: AppState
  dispatch: Dispatch<Action>
}

const StoreContext = createContext<StoreValue | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, loadState)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // 存储失败（如隐私模式）时静默降级为内存态
    }
  }, [state])

  const value = useMemo(() => ({ state, dispatch }), [state])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useAppStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useAppStore 必须在 AppStoreProvider 内使用')
  return ctx
}
