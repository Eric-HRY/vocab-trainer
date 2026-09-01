/** 词库中的一个词条（id 由数组下标生成，全局唯一） */
export interface Word {
  id: string
  word: string
  ipa: string
  chinese: string
  definition_en: string
  example_en: string
  example_zh: string
  subject: string
}

/** 单个单词的 SRS 进度 */
export interface WordProgress {
  /** 学习阶段 0-5，5 为已掌握 */
  stage: number
  /** 下次复习日期，本地 yyyy-mm-dd */
  dueDate: string
  /** 首次学会日期，本地 yyyy-mm-dd */
  learnedAt: string
  /** 最近一次作答结果（用于识别「今天刚答错过」的重考词） */
  lastResult?: 'correct' | 'wrong'
  /** 最近一次作答日期，本地 yyyy-mm-dd */
  lastAnswered?: string
  /** 累计答错次数（自由复习不计） */
  wrongCount?: number
  /** 累计答对次数（自由复习不计） */
  correctCount?: number
}

/** 某一天的学习记录 */
export interface DayRecord {
  /** 当天首次学会的新词 id */
  newIds: string[]
  /** 当天完成复习（最终答对）的词 id */
  reviewIds: string[]
}

export interface Settings {
  /** 每日新词配额 */
  dailyNew: number
  /** 发音开关 */
  soundOn: boolean
}

export interface AppState {
  progress: Record<string, WordProgress>
  days: Record<string, DayRecord>
  /** 任务全部完成的日期列表（用于 streak） */
  completedDates: string[]
  settings: Settings
  /** 首次引导是否已读 */
  onboarded: boolean
}

/**
 * en2zh：看英文选释义；zh2en：看释义选单词；
 * ex2en：看挖空例句选单词（复习多轮后的活用题）
 */
export type QuizDirection = 'en2zh' | 'zh2en' | 'ex2en'
/**
 * new：新学（答对即入记忆曲线）
 * review：记忆曲线安排的到期复习
 * practice：自由复习（练习模式，不影响 stage / dueDate 与每日记录）
 */
export type SessionKind = 'new' | 'review' | 'practice'

/** 学习会话队列中的一项 */
export interface SessionItem {
  wordId: string
  kind: SessionKind
  direction: QuizDirection
  /** 当天答错后重新排队的重考项：答对按 stage 0 结算，不升档 */
  isRetry?: boolean
}
