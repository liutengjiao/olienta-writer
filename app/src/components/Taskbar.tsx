import type { TaskItem } from '../types'

type Props = {
  tasks: TaskItem[]
}

export function Taskbar({ tasks }: Props) {
  return (
    <footer className="taskbar">
      <div className="taskbar-title">任务</div>
      <div className="taskbar-body">
        {tasks.length === 0 ? (
          <span className="empty-note">暂无任务，AI 工作流启动后会在这里显示进度</span>
        ) : (
          tasks.map((task) => (
            <span className={`task ${task.status}`} key={task.id}>{task.label}</span>
          ))
        )}
      </div>
    </footer>
  )
}
