import type { Locale, TranslationKey } from '../i18n'
import type { TaskItem, TaskLogItem } from '../types'

type T = (locale: Locale, key: TranslationKey) => string

type Props = {
  tasks: TaskItem[]
  taskLogs: TaskLogItem[]
  liveMessage?: string
  locale: Locale
  t: T
}

export function Taskbar({ tasks, taskLogs, liveMessage, locale, t }: Props) {
  const visibleLogs = taskLogs.slice(-4).reverse()

  return (
    <footer className="taskbar">
      <div className="taskbar-title">{t(locale, 'taskbar.title')}</div>
      <div className="taskbar-body">
        <div className="taskbar-status-strip">
          {tasks.length === 0 ? (
            <span className="empty-note">{t(locale, 'taskbar.emptyTasks')}</span>
          ) : (
            tasks.map((task) => (
              <span className={`task ${task.status}`} key={task.id}>{task.label}</span>
            ))
          )}
        </div>
        <div className="taskbar-log-feed" aria-live="polite">
          {liveMessage && <span className="task-log-line live">{liveMessage}</span>}
          {visibleLogs.length === 0 && !liveMessage ? (
            <span className="empty-note">{t(locale, 'taskbar.emptyLogs')}</span>
          ) : (
            visibleLogs.map((log) => (
              <span className={`task-log-line ${log.status}`} key={log.id}>
                <time>{log.time}</time>
                {log.message}
              </span>
            ))
          )}
        </div>
      </div>
    </footer>
  )
}
