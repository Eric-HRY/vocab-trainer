import raw from './words.json'
import type { Word } from '@/types'

export const WORDS: Word[] = raw as Word[]

export const WORD_BY_ID: Map<string, Word> = new Map(WORDS.map((w) => [w.id, w]))

/** 学科元信息：中文名 + 低饱和暖色系标识色 */
export const SUBJECT_META: Record<string, { zh: string; color: string }> = {
  Maths: { zh: '数学', color: 'hsl(16 42% 46%)' },
  'I&S': { zh: '人文与社会', color: 'hsl(28 36% 44%)' },
  Design: { zh: '设计', color: 'hsl(64 18% 40%)' },
  'Media & Film': { zh: '媒体与影视', color: 'hsl(348 22% 46%)' },
  'Visual Art': { zh: '视觉艺术', color: 'hsl(40 48% 44%)' },
  Music: { zh: '音乐', color: 'hsl(18 20% 42%)' },
  PHE: { zh: '体育', color: 'hsl(96 18% 40%)' },
  Science: { zh: '科学', color: 'hsl(172 16% 38%)' },
}

export const SUBJECT_ORDER = [
  'Maths',
  'I&S',
  'Design',
  'Media & Film',
  'Visual Art',
  'Music',
  'PHE',
  'Science',
]
