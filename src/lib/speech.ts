/** 浏览器 SpeechSynthesis 英式发音 + 预采集真人原声播放 */

import { toast } from 'sonner'
import audioManifestJson from '@/data/audio-manifest.json'
import { WORDS } from '@/data/words'

// 真人原声清单：词条 id → 音频文件名数组（多词术语为顺序连播的分词文件）
const AUDIO_MANIFEST = audioManifestJson as Record<string, string[]>

// 文本 → 词条 id 的懒建反查表（用于中→英选项等只有文本没有 id 的场景）
let idByText: Map<string, string> | null = null
function lookupIdByText(text: string): string | undefined {
  if (!idByText) {
    idByText = new Map()
    for (const w of WORDS) {
      const key = w.word.trim().toLowerCase()
      if (!idByText.has(key)) idByText.set(key, w.id)
    }
  }
  return idByText.get(text.trim().toLowerCase())
}

let currentAudio: HTMLAudioElement | null = null

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.onended = null
    currentAudio.onerror = null
    currentAudio = null
  }
}

/** 播放词条真人原声；无音频时回退 SpeechSynthesis 合成发音 */
export function playWordAudio(audioId: string | null, fallbackText: string, enabled: boolean) {
  if (!enabled) return
  const id = audioId ?? lookupIdByText(fallbackText)
  const files = id ? AUDIO_MANIFEST[id] : undefined
  if (!files || files.length === 0) {
    speakEnglish(fallbackText, enabled)
    return
  }
  if (hasSpeech()) window.speechSynthesis.cancel()
  stopCurrentAudio()
  const seq = ++speakSeq
  const playAt = (i: number) => {
    if (seq !== speakSeq || i >= files.length) return
    const a = new Audio(`${import.meta.env.BASE_URL}audio/${files[i]}`)
    currentAudio = a
    a.onended = () => {
      if (seq === speakSeq) window.setTimeout(() => playAt(i + 1), 130)
    }
    a.onerror = () => {
      if (seq === speakSeq) speakEnglish(fallbackText, enabled)
    }
    a.play().catch(() => {
      if (seq === speakSeq) speakEnglish(fallbackText, enabled)
    })
  }
  playAt(0)
}

let cachedVoices: SpeechSynthesisVoice[] = []

function hasSpeech(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function refreshVoices() {
  if (hasSpeech()) {
    cachedVoices = window.speechSynthesis.getVoices()
  }
}

if (hasSpeech()) {
  refreshVoices()
  window.speechSynthesis.addEventListener('voiceschanged', refreshVoices)
}

// —— 用户手势标记：iOS Safari / 部分 webview 要求 speak 必须由手势触发 ——
let userGestured = false

export function hasUserGestured(): boolean {
  return userGestured
}

if (typeof window !== 'undefined') {
  const markGesture = () => {
    userGestured = true
    // 借首次手势预热嗓音列表（部分平台 getVoices 需用户激活后才返回完整结果）
    refreshVoices()
    window.removeEventListener('pointerdown', markGesture, true)
    window.removeEventListener('touchstart', markGesture, true)
  }
  window.addEventListener('pointerdown', markGesture, true)
  window.addEventListener('touchstart', markGesture, true)
}

// —— 环境不支持时的提示：全局最多 toast 一次，避免刷屏 ——
let unsupportedToastShown = false

function notifyUnsupportedOnce() {
  if (unsupportedToastShown) return
  unsupportedToastShown = true
  toast.warning('当前浏览器不支持发音，建议在 Safari/Chrome 中打开')
}

function pickBritishVoice(): SpeechSynthesisVoice | undefined {
  if (cachedVoices.length === 0) refreshVoices()
  const norm = (lang: string) => lang.replace('_', '-').toLowerCase()
  return (
    cachedVoices.find((v) => norm(v.lang) === 'en-gb') ??
    cachedVoices.find((v) => norm(v.lang).startsWith('en-gb')) ??
    cachedVoices.find((v) => /google uk english/i.test(v.name))
  )
}

function buildUtterance(text: string): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-GB'
  u.rate = 0.92
  const voice = pickBritishVoice()
  if (voice) u.voice = voice
  return u
}

/** cancel() 后等待的毫秒数：部分平台 cancel 后立刻 speak 会静默丢句 */
const CANCEL_SPEAK_GAP_MS = 60
/** 看门狗超时：onstart 未在该时间内触发视为本次朗读失败 */
const START_WATCHDOG_MS = 600

// 单调递增的朗读序号：新一轮 speak 使旧的延迟/看门狗回调失效，避免互相 cancel
let speakSeq = 0

function speakAttempt(text: string, seq: number, retriesLeft: number) {
  const synth = window.speechSynthesis
  const u = buildUtterance(text)
  let started = false
  const watchdog = window.setTimeout(() => {
    if (started || seq !== speakSeq) return
    if (retriesLeft > 0) {
      // 未收到 onstart：cancel 后隔一小段时间重试一次
      synth.cancel()
      window.setTimeout(() => {
        if (seq !== speakSeq) return
        if (synth.paused) synth.resume()
        speakAttempt(text, seq, retriesLeft - 1)
      }, CANCEL_SPEAK_GAP_MS)
    }
  }, START_WATCHDOG_MS)
  const clearWatchdog = () => window.clearTimeout(watchdog)
  u.onstart = () => {
    started = true
    clearWatchdog()
  }
  // 被 cancel / 自然结束 / 出错都会清理看门狗，防止误重试覆盖新朗读
  u.onend = clearWatchdog
  u.onerror = clearWatchdog
  synth.speak(u)
}

/** 朗读英文文本；enabled 为发音总开关。环境不支持时所有调用安全 no-op（并提示一次） */
export function speakEnglish(text: string, enabled: boolean) {
  if (!enabled) return
  if (!hasSpeech()) {
    notifyUnsupportedOnce()
    return
  }
  stopCurrentAudio()
  const synth = window.speechSynthesis
  const seq = ++speakSeq
  synth.cancel()
  window.setTimeout(() => {
    if (seq !== speakSeq) return
    if (synth.paused) synth.resume()
    speakAttempt(text, seq, 1)
  }, CANCEL_SPEAK_GAP_MS)
}
