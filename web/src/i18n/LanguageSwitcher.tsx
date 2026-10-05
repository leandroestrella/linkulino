import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LANGUAGES } from './index'

/** Flag menu to switch UI language; the choice is persisted (i18next → localStorage). */
export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const { setLanguage } = useAuth()
  const current = LANGUAGES.find((l) => l.code === i18n.resolvedLanguage) ?? LANGUAGES[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="change language">
          <span className="text-lg leading-none">{current.flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => {
              void i18n.changeLanguage(lang.code)
              // A signed-in person's choice is saved on their account too (see
              // docs/translations.md), so the app opens in it on their next
              // device. Best-effort: the switch itself already happened here.
              void setLanguage(lang.code).catch(() => {})
            }}
            className={lang.code === current.code ? 'font-semibold' : undefined}
          >
            <span className="mr-2">{lang.flag}</span>
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
