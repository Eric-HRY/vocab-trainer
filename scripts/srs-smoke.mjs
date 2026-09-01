import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  buildSession,
  exampleWithBlank,
  getProgressStats,
  getTodayStatus,
  pickReviewDirection,
  settleReviewAnswer,
} from './.build/srs.js'
import { answerText, buildOptions } from './.build/quiz.js'

const WORDS = JSON.parse(readFileSync(new URL('../src/data/words.json', import.meta.url), 'utf8'))
const today = '2026-07-22'
const tomorrow = '2026-07-23'

function baseState() {
  return {
    progress: {},
    days: {},
    completedDates: [],
    settings: { dailyNew: 20, soundOn: true },
    onboarded: true,
  }
}

// —— 1. 重考答对按 stage 0 结算（不跳档） ——
{
  const p = {
    stage: 3,
    dueDate: today,
    learnedAt: '2026-07-01',
    lastResult: 'wrong',
    lastAnswered: today,
  }
  const settled = settleReviewAnswer(p, today, true, true)
  assert.equal(settled.stage, 0, '重考答对 stage 应保持 0')
  assert.equal(settled.dueDate, tomorrow, '重考答对 dueDate 应为今天 + 1 天')

  const normal = settleReviewAnswer(
    { stage: 3, dueDate: today, learnedAt: '2026-07-01' },
    today,
    true,
    false,
  )
  assert.equal(normal.stage, 4, '正常复习答对应升 stage + 1')
  assert.equal(normal.dueDate, '2026-08-06', 'stage 4 应对应 15 天间隔')

  const wrong = settleReviewAnswer(
    { stage: 3, dueDate: today, learnedAt: '2026-07-01' },
    today,
    false,
    false,
  )
  assert.equal(wrong.stage, 0, '答错应降回 stage 0')
  assert.equal(wrong.dueDate, today, '答错应当天到期重新排队')
  assert.equal(wrong.lastResult, 'wrong')
}

// —— 1b. 重建队列时能识别「今天刚答错过」的词 ——
{
  const w = WORDS[0]
  const state = baseState()
  state.progress[w.id] = {
    stage: 0,
    dueDate: today,
    learnedAt: '2026-07-01',
    lastResult: 'wrong',
    lastAnswered: today,
  }
  const item = buildSession(state, WORDS, today).find((i) => i.wordId === w.id)
  assert.ok(item, '今天答错过的词应重新进入队列')
  assert.equal(item.isRetry, true, '今天答错过的词重建队列时应标记 isRetry')

  const state2 = baseState()
  state2.progress[w.id] = {
    stage: 0,
    dueDate: today,
    learnedAt: '2026-07-01',
    lastResult: 'wrong',
    lastAnswered: '2026-07-21',
  }
  const item2 = buildSession(state2, WORDS, today).find((i) => i.wordId === w.id)
  assert.equal(item2.isRetry, undefined, '昨天答错的词今天到期应按正常复习处理')
}

// —— 2. 无学习不点亮 streak ——
{
  // 词库全掌握：无待学内容，done 但 studied=false → 不应 MARK_DAY_DONE
  const mastered = baseState()
  for (const w of WORDS)
    mastered.progress[w.id] = { stage: 5, dueDate: '2026-08-01', learnedAt: '2026-06-01' }
  const s1 = getTodayStatus(mastered, WORDS, today)
  assert.equal(s1.done, true)
  assert.equal(s1.studied, false, '零学习时 studied 应为 false，不能点亮 streak')
  assert.equal(s1.hasWork, false, '全掌握时 hasWork 应为 false')

  // 全新用户：有任务但未作答 → studied=false 且 done=false
  const s2 = getTodayStatus(baseState(), WORDS, today)
  assert.equal(s2.studied, false)
  assert.equal(s2.hasWork, true)
  assert.equal(s2.done, false)

  // 当天实际答对过 → studied=true，任务完成时可点亮
  const st = baseState()
  const w = WORDS[0]
  st.progress[w.id] = { stage: 0, dueDate: tomorrow, learnedAt: today }
  st.days[today] = { newIds: [w.id], reviewIds: [] }
  st.settings.dailyNew = 1
  const s3 = getTodayStatus(st, WORDS, today)
  assert.equal(s3.studied, true, '当天实际答对过后 studied 应为 true')
  assert.equal(s3.done, true)
}

// —— 3. 中途调低每日配额：newTarget 不小于 newDone ——
{
  const st = baseState()
  const learned = WORDS.slice(0, 20)
  st.days[today] = { newIds: learned.map((w) => w.id), reviewIds: [] }
  for (const w of learned)
    st.progress[w.id] = { stage: 0, dueDate: tomorrow, learnedAt: today }
  st.settings.dailyNew = 10
  const s = getTodayStatus(st, WORDS, today)
  assert.equal(s.newTarget, 20, '调低配额后 newTarget 应保持不小于 newDone')
  assert.equal(s.newLeft, 0)
}

// —— 4. 干扰项去重升级 + 「（见上文）」释义替换 ——
{
  const stateWord = WORDS.find((w) => w.id === 'w273') // State（Design），与 I&S 的 state 重复
  for (let i = 0; i < 50; i++) {
    const opts = buildOptions(stateWord, WORDS, 'zh2en')
    assert.ok(opts.includes('State'), '应包含正确答案')
    assert.ok(!opts.includes('state'), '干扰项不得与题目 word 相同（忽略大小写）')
  }

  const seeAbove = WORDS.find((w) => w.id === 'w160') // liberalism（见上文）
  assert.equal(
    answerText(seeAbove, 'en2zh', WORDS),
    '自由主义',
    '见上文词条应展示同 word 的另一条完整释义',
  )
  for (let i = 0; i < 50; i++) {
    const opts = buildOptions(seeAbove, WORDS, 'en2zh')
    assert.equal(new Set(opts).size, opts.length, '选项不得重复')
    assert.ok(!opts.includes('自由主义（见上文）'), '选项不得出现「（见上文）」占位释义')
  }
}

// —— 5. 例句活用题：挖空、抽题方向、答案文本 ——
{
  // 词库中应存在可挖空的例句；挖空后不得再出现原词
  const blankable = WORDS.filter((w) => exampleWithBlank(w) !== null)
  assert.ok(blankable.length > 100, `可挖空例句应足够多，实际 ${blankable.length}`)
  const sample = blankable[0]
  const blanked = exampleWithBlank(sample)
  assert.ok(blanked.includes('______'), '挖空后应包含占位符')

  // 例句中找不到目标词时返回 null
  const fake = { ...sample, word: 'Zzxqww Nonexistent' }
  assert.equal(exampleWithBlank(fake), null, '找不到词时应返回 null')

  // ex2en 的正确答案是单词本身
  assert.equal(answerText(sample, 'ex2en', WORDS), sample.word)

  // 低 stage 不出例句题；高 stage 可出例句题且方向合法
  const low = { stage: 0, dueDate: today, learnedAt: '2026-07-01' }
  for (let i = 0; i < 200; i++) {
    const d = pickReviewDirection(low, sample)
    assert.ok(d === 'en2zh' || d === 'zh2en', 'stage 0 不应出例句题')
  }
  const high = { stage: 4, dueDate: today, learnedAt: '2026-07-01' }
  let exCount = 0
  for (let i = 0; i < 400; i++) {
    const d = pickReviewDirection(high, sample)
    assert.ok(d === 'en2zh' || d === 'zh2en' || d === 'ex2en', '方向必须合法')
    if (d === 'ex2en') exCount += 1
  }
  assert.ok(exCount > 40 && exCount < 280, `例句题概率应约 40%，实际 ${exCount}/400`)
}

// —— 6. 学习进度统计：已刷过 / 相对熟练 / 易错词 ——
{
  const st = baseState()
  const [a, b, c] = WORDS
  st.progress[a.id] = { stage: 0, dueDate: tomorrow, learnedAt: today, wrongCount: 1 }
  st.progress[b.id] = { stage: 3, dueDate: tomorrow, learnedAt: today, wrongCount: 2, correctCount: 5 }
  st.progress[c.id] = { stage: 5, dueDate: tomorrow, learnedAt: today }
  const stats = getProgressStats(st, WORDS)
  assert.equal(stats.total, WORDS.length)
  assert.equal(stats.learned, 3)
  assert.equal(stats.proficient, 2, 'stage ≥ 3 计入相对熟练')
  assert.equal(stats.errorProne, 1, '累计答错 ≥ 2 次计入易错词')
  const empty = getProgressStats(baseState(), WORDS)
  assert.equal(empty.avgStageRatio, 0, '无学习记录时平均阶段为 0')
}

console.log('SRS 冒烟测试全部通过 ✓')
