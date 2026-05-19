import { useUIStore } from '@/stores/ui-store'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Settings, Monitor, Moon, Sun } from 'lucide-react'
import { SUPPORTED_LANGUAGES } from '@/i18n'

function useUILanguage() {
  const language = useUIStore((s) => s.language)
  if (language === 'system') {
    return navigator.language.startsWith('zh') ? 'zh' : 'en'
  }
  return language as 'zh' | 'en'
}

export function SettingsDialog({ children }: { children?: React.ReactNode }) {
  const isZh = useUILanguage()

  const labels = {
    settings: isZh ? '设置' : 'Settings',
    theme: isZh ? '主题' : 'Theme',
    light: isZh ? '浅色' : 'Light',
    dark: isZh ? '深色' : 'Dark',
    system: isZh ? '跟随系统' : 'System',
    language: isZh ? '语言' : 'Language',
    followSystem: isZh ? '跟随系统' : 'System',
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children ?? (
          <button className="flex items-center gap-2 text-sm cursor-pointer">
            <Settings className="h-4 w-4" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{labels.settings}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <SettingSection title={labels.theme}>
            <div className="flex gap-2">
              <ThemeOption value="light" label={labels.light} icon={Sun} />
              <ThemeOption value="dark" label={labels.dark} icon={Moon} />
              <ThemeOption value="system" label={labels.system} icon={Monitor} />
            </div>
          </SettingSection>

          <SettingSection title={labels.language}>
            <div className="grid grid-cols-2 gap-2">
              <LanguageOption value="system" label={labels.followSystem} icon={Monitor} />
              {SUPPORTED_LANGUAGES.map((lang) => (
                <LanguageOption key={lang.code} value={lang.code} label={lang.name} />
              ))}
            </div>
          </SettingSection>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function ThemeOption({ value, label, icon: Icon }: {
  value: 'light' | 'dark' | 'system'; label: string; icon: React.ComponentType<{ className?: string }>
}) {
  const current = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)

  return (
    <button
      onClick={() => setTheme(value)}
      className={cn(
        'flex flex-1 flex-col items-center gap-1.5 p-3 rounded-md border text-sm transition-colors',
        current === value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
  )
}

function LanguageOption({ value, label, icon: Icon }: {
  value: string; label: string; icon?: React.ComponentType<{ className?: string }>
}) {
  const current = useUIStore((s) => s.language)
  const setLanguage = useUIStore((s) => s.setLanguage)

  return (
    <button
      onClick={() => setLanguage(value as 'zh' | 'en' | 'system')}
      className={cn(
        'w-full text-left px-3 py-2 rounded-md border text-sm transition-colors',
        current === value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'
      )}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4" />}
        <span>{label}</span>
      </div>
    </button>
  )
}