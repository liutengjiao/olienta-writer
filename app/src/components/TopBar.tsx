import type { ProjectSummary } from '../types'

type Props = {
  project: ProjectSummary | null
}

export function TopBar({
  project,
}: Props) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <strong>Olienta</strong>
        <span>{project ? project.name : '未打开项目'}</span>
      </div>
    </header>
  )
}
