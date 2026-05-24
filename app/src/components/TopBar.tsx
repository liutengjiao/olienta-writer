import { useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { openExternalUrl } from '../api/tauriApi'
import { isTauriRuntime } from '../constants'
import type { Locale, TranslationKey } from '../i18n'
import type { ProjectSummary } from '../types'
import wechatDonation from '../assets/donation/wechat.jpg'

const PAYPAL_ME_URL = 'https://paypal.me/olienta'

type T = (locale: Locale, key: TranslationKey) => string

type Props = {
  project: ProjectSummary | null
  locale: Locale
  onLocaleChange: (locale: Locale) => void
  theme: 'light' | 'dark'
  onThemeToggle: () => void
  t: T
}

export function TopBar({
  project,
  locale,
  onLocaleChange,
  theme,
  onThemeToggle,
  t,
}: Props) {
  const [supportOpen, setSupportOpen] = useState(false)
  const appWindow = isTauriRuntime ? getCurrentWindow() : null

  function minimizeWindow() {
    void appWindow?.minimize()
  }

  function toggleMaximizeWindow() {
    void appWindow?.toggleMaximize()
  }

  function closeWindow() {
    void appWindow?.close()
  }

  return (
    <header className="topbar" data-tauri-drag-region>
      <div className="topbar-title" data-tauri-drag-region>
        <span className="topbar-brand-lockup">
          <span className="topbar-logo" aria-hidden="true"><span>Ol</span></span>
          <strong>Olienta Writer</strong>
        </span>
        <span className="topbar-tagline">{t(locale, 'app.tagline')}</span>
        <em>{project ? project.name : t(locale, 'app.noProject')}</em>
      </div>
      <div className="topbar-tools" aria-label={t(locale, 'tools.label')}>
        <label className="language-select">
          <span>{t(locale, 'language.label')}</span>
          <select value={locale} onChange={(event) => onLocaleChange(event.target.value as Locale)}>
            <option value="zh-CN">中文</option>
            <option value="en-US">English</option>
          </select>
        </label>
        <div className="support-menu">
          <button
            type="button"
            className="support-button"
            onClick={() => setSupportOpen((current) => !current)}
            aria-expanded={supportOpen}
          >
            {t(locale, 'support.button')}
          </button>
          {supportOpen && (
            <div className="support-popover" role="dialog" aria-label={t(locale, 'support.title')}>
              <strong>{t(locale, 'support.title')}</strong>
              <p>{t(locale, 'support.body')}</p>
              {locale === 'zh-CN' ? (
                <img className="support-qr" src={wechatDonation} alt={t(locale, 'support.wechatAlt')} />
              ) : (
                <div className="support-paypal-placeholder">
                  <span>{t(locale, 'support.paypalPending')}</span>
                  <button type="button" onClick={() => void openExternalUrl(PAYPAL_ME_URL)}>
                    {t(locale, 'support.paypalLink')}
                  </button>
                </div>
              )}
              <a className="support-feedback-link" href="mailto:olientavip@gmail.com">
                {t(locale, 'support.feedback')}
              </a>
              <small>{t(locale, 'support.note')}</small>
            </div>
          )}
        </div>
        <span>100%</span>
        <button type="button" aria-label={t(locale, 'tools.search')}>S</button>
        <button
          type="button"
          className="theme-toggle-button"
          onClick={onThemeToggle}
          aria-label={theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
          title={theme === 'dark' ? '日间模式' : '夜间模式'}
        >
          {theme === 'dark' ? '日' : '夜'}
        </button>
        <button type="button" aria-label={t(locale, 'tools.settings')}>⚙</button>
        {isTauriRuntime && (
          <div className="window-controls" aria-label="Window controls">
            <button type="button" className="window-control" aria-label="Minimize" onClick={minimizeWindow}>
              -
            </button>
            <button type="button" className="window-control" aria-label="Maximize or restore" onClick={toggleMaximizeWindow}>
              □
            </button>
            <button type="button" className="window-control close" aria-label="Close" onClick={closeWindow}>
              ×
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
