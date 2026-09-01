import type { QuizDirection, Word } from '@/types'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 「（见上文）」占位释义：词库中少量重复词条的从简写法 */
const SEE_ABOVE_RE = /[（(]见上文[)）]/

/**
 * 词条的正确答案展示文本。
 * 对 chinese 含「（见上文）」的词条，改用同 word 的另一条完整释义展示，
 * 避免答案区出现「自由主义（见上文）」这类无信息文本。
 */
export function answerText(w: Word, dir: QuizDirection, all: Word[]): string {
  if (dir === 'zh2en' || dir === 'ex2en') return w.word
  if (!SEE_ABOVE_RE.test(w.chinese)) return w.chinese
  const sibling = all.find(
    (o) =>
      o.id !== w.id &&
      o.word.toLowerCase() === w.word.toLowerCase() &&
      !SEE_ABOVE_RE.test(o.chinese),
  )
  return sibling?.chinese ?? w.chinese
}

/** 某个方向下选项的展示文本 */
export function quizText(w: Word, dir: QuizDirection): string {
  return dir === 'en2zh' ? w.chinese : w.word
}

/**
 * 生成四选一选项（含正确答案）。
 * 干扰项优先同学科，不足时用全词库补齐；按展示文本去重，
 * 且排除与题目 word 文本相同（忽略大小写）的词，
 * 避免跨学科重复词（Identify / State / Genre / Motif / liberalism）造成歧义选项。
 */
export function buildOptions(target: Word, all: Word[], dir: QuizDirection): string[] {
  const answer = answerText(target, dir, all)
  const targetWord = target.word.toLowerCase()
  const seen = new Set<string>([answer])
  const sameSubject = shuffle(
    all.filter((w) => w.id !== target.id && w.subject === target.subject),
  )
  const others = shuffle(all.filter((w) => w.id !== target.id && w.subject !== target.subject))
  const distractors: string[] = []
  for (const w of [...sameSubject, ...others]) {
    if (distractors.length >= 3) break
    if (w.word.toLowerCase() === targetWord) continue
    const t = answerText(w, dir, all)
    if (!seen.has(t)) {
      seen.add(t)
      distractors.push(t)
    }
  }
  return shuffle([answer, ...distractors])
}
