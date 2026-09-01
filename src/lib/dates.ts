/** 本地日期工具：统一使用 yyyy-mm-dd（本地时区，非 UTC） */

export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr(): string {
  return toLocalDateStr(new Date())
}

/** 在 yyyy-mm-dd 上加减 n 天（本地时区） */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return toLocalDateStr(new Date(y, m - 1, d + n))
}

/** yyyy-mm-dd → M月D日 */
export function formatCN(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${m}月${d}日`
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 今天的中文展示：M月D日 周X */
export function todayCN(): string {
  const now = new Date()
  return `${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAYS[now.getDay()]}`
}
