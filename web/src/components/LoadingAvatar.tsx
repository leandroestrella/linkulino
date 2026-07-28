import { useTranslation } from 'react-i18next'
import { LoadingDots } from '@/components/LoadingDots'

/**
 * The shared "loading" visual: the mascot (same size as the read-gate's
 * anonymous-state avatar) with a speech bubble above it (the same bubble/tail
 * markup as the read-gate's sign-in prompt) saying "loading…". Used wherever
 * a page or card is waiting on data instead of a plain text line.
 */
export function LoadingAvatar() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="relative inline-block rounded-2xl border-2 border-black bg-white px-4 py-2 text-sm font-bold text-black shadow-md">
        {t('home.loading')}
        <LoadingDots />
        <div className="absolute top-full left-1/2 -mt-px -translate-x-1/2">
          <div className="h-0 w-0 border-x-[11px] border-t-[13px] border-x-transparent border-t-black" />
          <div className="absolute top-0 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[9px] border-t-[11px] border-x-transparent border-t-white" />
        </div>
      </div>
      <img src="/linkulino.gif" alt="" className="w-64 max-w-[80vw] sm:w-80" />
    </div>
  )
}
