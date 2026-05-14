import type { ChapterSummary, FrameworkFileSummary, ModuleKey, ModuleSubViewKey, SkillFileSummary, ViewKey } from '../types'

type Props = {
  activeModule: ModuleKey
  activeModuleView: ModuleSubViewKey
  activeView: ViewKey
  assistantState: string
  currentChapter: ChapterSummary
  selectedChapterId: string
  chapterPath: string
  writingBrief: string
  frameworkPath: string
  frameworkFiles: FrameworkFileSummary[]
  selectedFrameworkFile: string
  frameworkContent: string
  blueprintPath: string
  blueprint: string
  authorInputPath: string
  authorInput: string
  confirmedFactsPath: string
  confirmedFacts: string
  openLoopsPath: string
  openLoops: string
  aiProvidersPath: string
  aiProvidersJson: string
  providerTestMessage: string
  candidateWarnings: string[]
  candidatePath: string
  candidateReviewPath: string
  candidate: string
  skillFiles: SkillFileSummary[]
  onClose: () => void
  onComposeBrief: () => void
  onGenerateFrameworkDraft: () => void
  onSaveFrameworkFile: () => void
  onSelectFrameworkFile: (fileName: string) => void
  onChangeFrameworkContent: (content: string) => void
  onSaveBlueprint: () => void
  onChangeBlueprint: (content: string) => void
  onGenerateBlueprintDraft: () => void
  onRegenerateAllBlueprints: () => void
  onSaveAuthorInput: () => void
  onChangeAuthorInput: (content: string) => void
  onSaveKnowledgeFile: (kind: 'confirmed-facts' | 'open-loops') => void
  onChangeConfirmedFacts: (content: string) => void
  onChangeOpenLoops: (content: string) => void
  onRescanFacts: () => void
  onSaveAiProviders: () => void
  onTestAiProvider: () => void
  onChangeAiProvidersJson: (content: string) => void
  onChangeWritingBrief: (content: string) => void
  onChangeCandidate: (content: string) => void
  onGenerateCandidate: () => void
  onSaveCandidate: () => void
  onClearCandidate: () => void
  onAdoptCandidate: () => void
}

type AgentKind = 'settings' | 'framework' | 'blueprint' | 'draft' | 'chapter' | 'knowledge' | 'provider' | 'general'

type AgentContext = {
  kind: AgentKind
  title: string
  target: string
  path: string
  description: string
  policy: string
  contextItems: string[]
}

type ContextCheck = {
  label: string
  path: string
  ready: boolean
  note: string
}

export function AgentPanel(props: Props) {
  const context = getAgentContext(props.activeModule, props.activeModuleView, props.activeView)
  const activeSkills = props.skillFiles.filter((file) => !file.disabled)
  const temporarySkills = activeSkills.filter((file) => file.temporary)
  const frameworkFocused = context.kind === 'framework' || context.kind === 'settings'
  const blueprintFocused = context.kind === 'blueprint'
  const chapterFocused = context.kind === 'chapter' || context.kind === 'draft'
  const knowledgeFocused = context.kind === 'knowledge'
  const providerFocused = context.kind === 'provider'
  const checks = buildContextChecks(props, context, activeSkills)

  return (
    <aside className="agent-panel" aria-label="上下文助手">
      <header className="agent-header">
        <div>
          <p className="eyebrow">AGENT</p>
          <h2>{context.title}</h2>
          <p>{context.description}</p>
        </div>
        <div className="agent-header-actions">
          <span className="status-pill">{props.assistantState}</span>
          <button type="button" className="agent-close" onClick={props.onClose} aria-label="隐藏助手">
            ×
          </button>
        </div>
      </header>

      <section className="agent-context-card">
        <span>当前任务</span>
        <strong>{context.target}</strong>
        <p>{context.path}</p>
      </section>

      <section className="agent-block">
        <div className="side-editor-header compact">
          <div>
            <h3>生成前上下文检查</h3>
            <p>{context.policy}</p>
          </div>
        </div>
        <ul className="agent-check-list">
          {checks.map((item) => (
            <li key={`${item.label}-${item.path}`} className={item.ready ? 'ready' : 'muted'}>
              <span>{item.ready ? '✓' : '○'}</span>
              <div>
                <strong>{item.label}</strong>
                <p>{item.path}</p>
                <small>{item.note}</small>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="agent-block">
        <h3>本次生成会调用</h3>
        <ul className="agent-context-list">
          {context.contextItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
          <li>已启用 Skill：{activeSkills.length === 0 ? '暂无' : activeSkills.map((file) => file.name).join('、')}</li>
          {temporarySkills.length > 0 && <li>临时 Skill：{temporarySkills.map((file) => file.name).join('、')}</li>}
        </ul>
      </section>

      <section className="agent-compose">
        {frameworkFocused && (
          <>
            <button type="button" className="primary" onClick={props.onGenerateFrameworkDraft}>生成框架草案</button>
            <button type="button" onClick={props.onSaveFrameworkFile}>保存框架</button>
          </>
        )}
        {blueprintFocused && (
          <>
            <button type="button" className="primary" onClick={props.onGenerateBlueprintDraft}>生成本章蓝图</button>
            <button type="button" onClick={props.onRegenerateAllBlueprints}>生成全部蓝图</button>
            <button type="button" onClick={props.onSaveBlueprint}>保存蓝图</button>
          </>
        )}
        {chapterFocused && (
          <>
            <button type="button" onClick={props.onComposeBrief}>装配任务书</button>
            <button type="button" onClick={props.onClearCandidate}>清空候选稿</button>
            <button type="button" className="primary" onClick={props.onGenerateCandidate}>生成候选稿</button>
          </>
        )}
        {knowledgeFocused && (
          <>
            <button type="button" className="primary" onClick={props.onRescanFacts}>重扫事实库</button>
            <button type="button" onClick={props.onComposeBrief}>刷新当前章任务书</button>
          </>
        )}
        {providerFocused && (
          <>
            <button type="button" className="primary" onClick={props.onTestAiProvider}>测试 Provider</button>
            <button type="button" onClick={props.onSaveAiProviders}>保存 Provider</button>
          </>
        )}
        {!frameworkFocused && !blueprintFocused && !chapterFocused && !knowledgeFocused && !providerFocused && (
          <button type="button" onClick={props.onComposeBrief}>刷新当前章任务书</button>
        )}
      </section>

      {chapterFocused && (
        <section className="agent-block candidate-block">
          <BlockHeader title="候选稿" path={props.candidatePath} />
          <textarea
            className="agent-candidate"
            value={props.candidate}
            onChange={(event) => props.onChangeCandidate(event.target.value)}
            placeholder="AI 输出先停在这里。只有作者采用后，才会进入正文。"
            aria-label="候选稿编辑器"
          />
          <div className="button-row">
            <button type="button" className="ghost-button" onClick={props.onSaveCandidate}>保存候选稿</button>
            <button type="button" className="primary full-button" onClick={props.onAdoptCandidate}>
              采用为正文
            </button>
          </div>
        </section>
      )}

      {chapterFocused && (
        <section className="agent-block">
          <BlockHeader title="审查提醒" path={props.candidateReviewPath} />
          {props.candidateWarnings.length === 0 ? (
            <p className="empty-note">暂无提醒。</p>
          ) : (
            <ul className="agent-warning-list">
              {props.candidateWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <details className="agent-details" open={chapterFocused || blueprintFocused}>
        <summary>当前章节上下文</summary>
        <section className="agent-block">
          <div className="side-editor-header compact">
            <div>
              <h3>{props.currentChapter.title}</h3>
              <p>{props.chapterPath}</p>
            </div>
          </div>
          <p className="agent-context-note">
            第 {props.selectedChapterId} 章 · {props.currentChapter.words} 字 · {props.currentChapter.state}
          </p>
        </section>
        <SideEditor
          title="章节蓝图"
          path={props.blueprintPath}
          value={props.blueprint}
          label="章节蓝图编辑器"
          onChange={props.onChangeBlueprint}
          onSave={props.onSaveBlueprint}
        />
        <SideEditor
          title="作者输入"
          path={props.authorInputPath}
          value={props.authorInput}
          label="作者输入编辑器"
          onChange={props.onChangeAuthorInput}
          onSave={props.onSaveAuthorInput}
        />
        <SideEditor
          title="写作任务书"
          path="临时装配结果"
          value={props.writingBrief}
          label="写作任务书预览"
          onChange={props.onChangeWritingBrief}
          onSave={props.onComposeBrief}
          saveLabel="装配"
        />
      </details>

      <details className="agent-details" open={frameworkFocused}>
        <summary>框架文件</summary>
        <section className="agent-block">
          <div className="side-editor-header">
            <div>
              <h3>故事框架</h3>
              <p>{props.frameworkPath}</p>
            </div>
            <button type="button" onClick={props.onSaveFrameworkFile}>保存</button>
          </div>
          <select
            className="framework-select"
            value={props.selectedFrameworkFile}
            onChange={(event) => props.onSelectFrameworkFile(event.target.value)}
          >
            {props.frameworkFiles.length === 0 ? (
              <option value="01-setting.md">01-setting.md</option>
            ) : (
              props.frameworkFiles.map((file) => (
                <option key={file.relative_path} value={file.name}>
                  {file.name}
                </option>
              ))
            )}
          </select>
          <textarea
            className="agent-small-editor"
            value={props.frameworkContent}
            onChange={(event) => props.onChangeFrameworkContent(event.target.value)}
            aria-label="故事框架编辑器"
          />
        </section>
      </details>

      <details className="agent-details" open={knowledgeFocused}>
        <summary>事实与伏笔</summary>
        <SideEditor
          title="已确认事实"
          path={props.confirmedFactsPath}
          value={props.confirmedFacts}
          label="已确认事实编辑器"
          onChange={props.onChangeConfirmedFacts}
          onSave={() => props.onSaveKnowledgeFile('confirmed-facts')}
        />
        <SideEditor
          title="未闭合伏笔"
          path={props.openLoopsPath}
          value={props.openLoops}
          label="未闭合伏笔编辑器"
          onChange={props.onChangeOpenLoops}
          onSave={() => props.onSaveKnowledgeFile('open-loops')}
        />
      </details>

      <details className="agent-details" open={providerFocused}>
        <summary>AI Provider</summary>
        <section className="agent-block">
          <div className="side-editor-header">
            <div>
              <h3>Provider 配置</h3>
              <p>{props.aiProvidersPath}</p>
            </div>
            <div className="button-pair">
              <button type="button" onClick={props.onTestAiProvider}>测试</button>
              <button type="button" onClick={props.onSaveAiProviders}>保存</button>
            </div>
          </div>
          <textarea
            className="agent-small-editor"
            value={props.aiProvidersJson}
            onChange={(event) => props.onChangeAiProvidersJson(event.target.value)}
            aria-label="AI Provider JSON 配置"
          />
          <p className="provider-test">{props.providerTestMessage}</p>
        </section>
      </details>
    </aside>
  )
}

function buildContextChecks(props: Props, context: AgentContext, activeSkills: SkillFileSummary[]): ContextCheck[] {
  const has = (value: string) => value.trim().length > 0
  const checks: ContextCheck[] = []

  if (context.kind === 'framework' || context.kind === 'settings') {
    checks.push(
      {
        label: '当前框架文件',
        path: props.frameworkPath,
        ready: has(props.frameworkContent),
        note: '草案会写回这个编辑区，保存后才成为正式边界。',
      },
      {
        label: '已确认事实',
        path: props.confirmedFactsPath,
        ready: has(props.confirmedFacts),
        note: '用于避免框架草案推翻作者已经确认的正文事实。',
      },
    )
  }

  if (context.kind === 'blueprint' || context.kind === 'draft' || context.kind === 'chapter') {
    checks.push(
      {
        label: '当前章节',
        path: props.chapterPath,
        ready: Boolean(props.selectedChapterId),
        note: `当前绑定第 ${props.selectedChapterId} 章。`,
      },
      {
        label: '章节蓝图',
        path: props.blueprintPath,
        ready: has(props.blueprint),
        note: '候选稿必须优先服从本章蓝图。',
      },
      {
        label: '作者输入',
        path: props.authorInputPath,
        ready: has(props.authorInput),
        note: '作者本章想法优先级最高，可短可长。',
      },
      {
        label: '写作任务书',
        path: 'manuscript/briefs/当前章.md',
        ready: has(props.writingBrief),
        note: '生成候选稿前建议先装配任务书。',
      },
    )
  }

  if (context.kind === 'knowledge' || context.kind === 'draft' || context.kind === 'chapter' || context.kind === 'blueprint') {
    checks.push(
      {
        label: '事实库',
        path: props.confirmedFactsPath,
        ready: has(props.confirmedFacts),
        note: '正文保存后的事实会在这里约束后续生成。',
      },
      {
        label: '伏笔库',
        path: props.openLoopsPath,
        ready: has(props.openLoops),
        note: '用于避免伏笔丢失或过早回收。',
      },
    )
  }

  if (context.kind === 'provider') {
    checks.push({
      label: 'Provider 配置',
      path: props.aiProvidersPath,
      ready: has(props.aiProvidersJson),
      note: '只读取配置，不把 API Key 写入模型调用记录。',
    })
  }

  checks.push({
    label: 'Skill',
    path: 'skills/',
    ready: activeSkills.length > 0,
    note: activeSkills.length > 0 ? `${activeSkills.length} 个 Skill 会进入上下文。` : '暂无启用 Skill，生成会只依赖项目文件。',
  })

  return checks
}

function getAgentContext(activeModule: ModuleKey, activeModuleView: ModuleSubViewKey, activeView: ViewKey): AgentContext {
  if (activeModule === 'project-structure') {
    if (activeView === 'novel-settings') {
      return {
        kind: 'settings',
        title: '配置助手',
        target: '小说设置',
        path: 'framework/01-setting.md',
        description: '整理基础设定、全局写作要求、文风和 AI Provider。',
        policy: '配置草案只进入编辑区，作者保存后才成为全局约束。',
        contextItems: ['当前小说设置', '故事构架文件', '已确认事实', '已启用 Skill', 'AI Provider 配置'],
      }
    }
    if (['story-premise', 'characters', 'world', 'plot-outline', 'timeline'].includes(activeView)) {
      return {
        kind: 'framework',
        title: '故事构架助手',
        target: getFrameworkTarget(activeView),
        path: getFrameworkPath(activeView),
        description: '整理故事边界文件，确保 AI 不脱离前提、角色、世界观和情节大纲。',
        policy: '框架草案不会自动覆盖文件，保存后才成为后续 AI 必须遵守的边界。',
        contextItems: ['当前框架文件', '其它故事构架文件', '事实库', '伏笔库', '已启用 Skill'],
      }
    }
    if (activeView === 'chapter-blueprint') {
      return {
        kind: 'blueprint',
        title: '蓝图助手',
        target: '当前章节蓝图',
        path: 'blueprints/chapters/当前章.md',
        description: '生成或整理章节蓝图，让每一章只推进该章应该发生的内容。',
        policy: '蓝图和正文分开。蓝图草案先进入编辑区，保存后才写入本地文件。',
        contextItems: ['故事前提', '角色图谱', '世界观', '情节大纲', '时间轴及里程碑', '事实库', '前后章节蓝图', '已启用 Skill'],
      }
    }
    if (activeView === 'draft-box') {
      return {
        kind: 'draft',
        title: '候选稿助手',
        target: '草稿箱 / 候选稿',
        path: 'manuscript/candidates/当前章.md',
        description: '生成候选稿和审查提醒，采用前不会进入正文。',
        policy: '候选稿是 AI 工作区。只有作者点击采用并保存后，才进入正文确认链。',
        contextItems: ['当前章节蓝图', '作者本章输入', '写作任务书', '事实库', '钉选材料', '已启用 Skill'],
      }
    }
    if (activeView === 'manuscript') {
      return {
        kind: 'chapter',
        title: '正文助手',
        target: '当前正文章节',
        path: 'manuscript/chapters/当前章.md',
        description: '围绕当前章节装配任务书和生成候选稿，正文仍由作者最终确认。',
        policy: '正文优先级最高。AI 只能生成候选，不直接替作者确认正文。',
        contextItems: ['当前正文', '当前章节蓝图', '作者本章输入', '写作任务书', '事实库', '钉选材料', '已启用 Skill'],
      }
    }
  }

  if (activeModule === 'knowledge') {
    return {
      kind: 'knowledge',
      title: '知识库助手',
      target: getModuleViewTitle(activeModuleView),
      path: 'facts/ 与 knowledge/',
      description: '重扫事实、整理本地资料，并把检索材料装配进当前章任务书。',
      policy: '知识库只提供上下文，不能越过作者确认链直接改正文。',
      contextItems: ['导入资料', '事实库', '未闭合伏笔', '当前章任务书', '已启用 Skill'],
    }
  }

  if (activeModule === 'model-calls') {
    return {
      kind: 'provider',
      title: '模型助手',
      target: getModuleViewTitle(activeModuleView),
      path: '.olienta/ai-providers.json',
      description: '配置、保存和测试多家 AI Provider，并追踪模型调用摘要。',
      policy: '模型调用记录只保存摘要和本地路径，不记录 API Key 或完整正文。',
      contextItems: ['Provider JSON', '模型调用记录', '当前项目配置'],
    }
  }

  return {
    kind: 'general',
    title: '上下文助手',
    target: getModuleViewTitle(activeModuleView),
    path: '当前页面上下文',
    description: '根据当前页面调用对应上下文，生成前先确认边界。',
    policy: '作者确认内容始终优先于 AI 输出。',
    contextItems: ['当前页面文档', '事实库', '已启用 Skill'],
  }
}

function getFrameworkTarget(view: ViewKey) {
  if (view === 'story-premise') return '故事前提'
  if (view === 'characters') return '角色图谱'
  if (view === 'world') return '世界观'
  if (view === 'plot-outline') return '情节大纲'
  if (view === 'timeline') return '时间轴及里程碑'
  return '故事构架'
}

function getFrameworkPath(view: ViewKey) {
  if (view === 'story-premise') return 'framework/02-premise.md'
  if (view === 'characters') return 'framework/03-characters.md'
  if (view === 'world') return 'framework/05-world.md'
  if (view === 'plot-outline') return 'framework/04-plot-outline.md'
  if (view === 'timeline') return 'timeline/events.md'
  return 'framework/'
}

function getModuleViewTitle(view: ModuleSubViewKey) {
  const titles: Partial<Record<ModuleSubViewKey, string>> = {
    'home-entry': '首页',
    'home-recent': '最近项目',
    'knowledge-overview': '知识库总览',
    'knowledge-facts': '事实库',
    'knowledge-markdown': '本地 Markdown',
    'knowledge-skills': 'Skill',
    'knowledge-search': '本地全文检索',
    'characters-overview': '角色总览',
    'characters-cards': '角色列表',
    'characters-relations': '关系图谱',
    'characters-growth': '成长线',
    'tasks-current': '当前任务',
    'tasks-history': '历史任务',
    'logs-author-confirmation': '作者确认日志',
    'logs-system-events': '系统事件',
    'model-providers': 'AI Provider',
    'model-call-records': '调用记录',
    'model-tests': '连接测试',
  }

  return titles[view] ?? '当前页面'
}

function BlockHeader({ title, path }: { title: string; path: string }) {
  return (
    <div className="side-editor-header compact">
      <div>
        <h3>{title}</h3>
        <p>{path}</p>
      </div>
    </div>
  )
}

function SideEditor({
  title,
  path,
  value,
  label,
  onChange,
  onSave,
  saveLabel = '保存',
}: {
  title: string
  path: string
  value: string
  label: string
  onChange: (content: string) => void
  onSave: () => void
  saveLabel?: string
}) {
  return (
    <section className="agent-block">
      <div className="side-editor-header">
        <div>
          <h3>{title}</h3>
          <p>{path}</p>
        </div>
        <button type="button" onClick={onSave}>{saveLabel}</button>
      </div>
      <textarea
        className="agent-small-editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      />
    </section>
  )
}
