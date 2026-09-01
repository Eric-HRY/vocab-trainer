import { NavLink, Outlet } from 'react-router'
import { BookOpenText, Flame, House, LibraryBig, Settings as SettingsIcon } from 'lucide-react'
import { useAppStore } from '@/store/AppStore'
import { getStreak } from '@/lib/srs'
import { todayStr } from '@/lib/dates'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/', label: '首页', icon: House },
  { to: '/study', label: '学习', icon: BookOpenText },
  { to: '/library', label: '词库', icon: LibraryBig },
  { to: '/settings', label: '设置', icon: SettingsIcon },
]

export default function Layout() {
  const { state } = useAppStore()
  const streak = getStreak(state, todayStr())

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <span className="text-lg font-bold text-primary">啸啸单词斩</span>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Flame className="size-4 text-[hsl(20_70%_50%)]" />
            {streak > 0 ? `连续 ${streak} 天` : '今天开始打卡吧'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-28 pt-5">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors',
                  isActive ? 'font-semibold text-primary' : 'text-muted-foreground',
                )
              }
            >
              <t.icon className="size-5" />
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
