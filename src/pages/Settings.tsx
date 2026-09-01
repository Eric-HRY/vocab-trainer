import { Volume2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useAppStore } from '@/store/AppStore'
import { playWordAudio } from '@/lib/speech'
import { WORDS } from '@/data/words'

const QUOTA_OPTIONS = [10, 15, 20, 30, 50]

export default function Settings() {
  const { state, dispatch } = useAppStore()

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">设置</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">学习设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-base">每日新词数</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">每天安排的新词上限</p>
            </div>
            <Select
              value={String(state.settings.dailyNew)}
              onValueChange={(v) => dispatch({ type: 'SET_DAILY_NEW', value: Number(v) })}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUOTA_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} 个
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-base">发音</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                英式发音（浏览器语音合成），关闭后喇叭按钮同时停用
              </p>
            </div>
            <Switch
              checked={state.settings.soundOn}
              onCheckedChange={(v) => dispatch({ type: 'SET_SOUND', value: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-base">测试发音</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                点按朗读一句英文，确认当前浏览器发音可用
              </p>
            </div>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={!state.settings.soundOn}
              onClick={() => playWordAudio('w000', 'Adjacent', true)}
            >
              <Volume2 className="size-4" />
              测试发音
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">数据</CardTitle>
          <CardDescription>全部学习进度只保存在本机浏览器中</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="rounded-full">
                清空全部进度
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确定要清空全部进度吗？</AlertDialogTitle>
                <AlertDialogDescription>
                  将删除所有单词的学习阶段、每日学习记录和连续天数，此操作无法恢复。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>再想想</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    dispatch({ type: 'RESET_ALL' })
                    toast.success('已清空全部进度')
                  }}
                >
                  确认清空
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1 pt-6 text-sm text-muted-foreground">
          <p>啸啸单词斩 · G10 学科词汇 {WORDS.length} 词</p>
          <p>数学 / 人文与社会 / 设计 / 媒体与影视 / 视觉艺术 / 音乐 / 体育 / 科学</p>
        </CardContent>
      </Card>
    </div>
  )
}
