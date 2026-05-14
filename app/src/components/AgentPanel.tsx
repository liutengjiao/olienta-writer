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
            X
          </button>
        </div>
      </header>

      <section className="agent-context-card">
        <span>当前目标</span>
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
              <span>{item.ready ? 'OK' : '-'}</span>
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
        <h3>本次生成会参考</h3>
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
            <button type="button" onClick={props.onRegenerateAllBlueprints}>重生成全部蓝图</button>
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
        note: '框架草案会先填入编辑器，保存后才成为作者确认版本。',
      },
      {
        label: '事实库',
        path: props.confirmedFactsPath,
        ready: has(props.confirmedFacts),
        note: '生成框架时会参考已确认事实，避免违背正文。',
      },
    )
  }

  if (context.kind === 'blueprint' || context.kind === 'chapter' || context.kind === 'draft') {
    checks.push(
      {
        label: '章节蓝图',
        path: props.blueprintPath,
        ready: has(props.blueprint),
        note: '候选稿生成必须服从当前章节蓝图。',
      },
      {
        label: '作者输入',
        path: props.authorInputPath,
        ready: has(props.authorInput),
        note: '作者输入会作为当前章节的直接意图。',
      },
      {
        label: '写作任务书',
        path: 'tasks/writing-briefs',
        ready: has(props.writingBrief),
        note: '任务书装配后会汇总蓝图、事实、Skill 和钉选材料。',
      },
    )
  }

  if (context.kind === 'knowledge') {
    checks.push(
      {
        label: '已确认事实',
        path: props.confirmedFactsPath,
        ready: has(props.confirmedFacts),
        note: '正文保存后可重扫事实库。',
      },
      {
        label: '未闭合伏笔',
        path: props.openLoopsPath,
        ready: has(props.openLoops),
        note: '伏笔会进入后续任务书上下文。',
      },
    )
  }

  if (context.kind === 'provider') {
    checks.push({
      label: 'Provider JSON',
      path: props.aiProvidersPath,
      ready: has(props.aiProvidersJson),
      note: props.providerTestMessage || '保存并测试后才建议用于真实生成。',
    })
  }

  checks.push({
    label: '启用 Skill',
    path: 'skills/selected',
    ready: activeSkills.length > 0,
    note: activeSkills.length > 0 ? `${activeSkills.length} 个 Skill 会进入上下文` : '当前没有启用 Skill。',
  })

  return checks
}

function getAgentContext(module: ModuleKey, moduleView: ModuleSubViewKey, view: ViewKey): AgentContext {
  if (view === 'novel-settings') {
    return {
      kind: 'settings',
      title: '小说设置助手',
      target: '基础设定与全局要求',
      path: 'framework/01-setting.md',
      description: '围绕作品基础设定、语言、题材和全局写作要求工作。',
      policy: '框架输出只进入编辑器，保存后才成为作者确认内容。',
      contextItems: ['当前设定文件', '其它框架摘要', '事实库', '作者输入'],
    }
  }

  if (['story-premise', 'characters', 'world', 'plot-outline', 'timeline'].includes(view)) {
    return {
      kind: 'framework',
      title: '故事框架助手',
      target: frameworkTarget(view),
      path: 'framework/*.md',
      description: '协助整理故事前提、角色、世界观、情节和时间线。',
      policy: '框架草案不会自动保存，作者修改并保存后才确认。',
      contextItems: ['当前框架文件', '其它框架文件', '已确认事实', '未闭合伏笔', '启用 Skill'],
    }
  }

  if (view === 'chapter-blueprint') {
    return {
      kind: 'blueprint',
      title: '章节蓝图助手',
      target: '当前章节蓝图',
      path: 'blueprints/chapters/*.md',
      description: '生成或重生成章节蓝图，并在保存后触发后续蓝图覆盖链路。',
      policy: '蓝图保存会影响后续章节蓝图，执行前请确认当前章方向。',
      contextItems: ['当前章节蓝图', '作者输入', '故事框架', '事实库', '启用 Skill'],
    }
  }

  if (view === 'draft-box') {
    return {
      kind: 'draft',
      title: '候选稿助手',
      target: '当前章节候选稿',
      path: 'manuscript/candidates/*.md',
      description: '候选稿只停留在草稿箱，必须由作者明确采用后才进入正文。',
      policy: 'AI 输出不会自动覆盖正文。',
      contextItems: ['写作任务书', '章节蓝图', '作者输入', '事实库', '钉选材料', '启用 Skill'],
    }
  }

  if (view === 'manuscript') {
    return {
      kind: 'chapter',
      title: '正文助手',
      target: '作者确认正文',
      path: 'manuscript/chapters/*.md',
      description: '正文保存即作者确认，会更新确认日志和事实库链路。',
      policy: '正文是最高优先级文本，候选稿必须手动采用。',
      contextItems: ['当前正文', '确认日志', '事实库', '候选稿'],
    }
  }

  if (module === 'knowledge') {
    return {
      kind: 'knowledge',
      title: '知识库助手',
      target: knowledgeTarget(moduleView),
      path: 'facts/、knowledge/、skills/',
      description: '管理事实、伏笔、本地资料、Skill 和检索上下文。',
      policy: '知识库文件是普通本地文件，保存后才进入后续任务书。',
      contextItems: ['已确认事实', '未闭合伏笔', '本地 Markdown', '钉选材料', 'Skill'],
    }
  }

  if (module === 'model-calls' || view === 'ai-providers') {
    return {
      kind: 'provider',
      title: '模型调用助手',
      target: 'AI Provider 配置与测试',
      path: '.olienta/ai-providers.json',
      description: '维护项目级 AI Provider、连接测试和调用记录。',
      policy: 'Provider 配置保存并测试后再用于真实生成。',
      contextItems: ['Provider JSON', '测试结果', '调用记录'],
    }
  }

  return {
    kind: 'general',
    title: '上下文助手',
    target: '当前工作区',
    path: view,
    description: '根据当前页面提供上下文检查和常用动作。',
    policy: '所有生成内容都遵守本地文件优先和作者确认原则。',
    contextItems: ['当前页面', '项目文件', '启用 Skill'],
  }
}

function frameworkTarget(view: ViewKey) {
  const targets: Partial<Record<ViewKey, string>> = {
    'story-premise': '故事前提',
    characters: '角色图谱',
    world: '世界观',
    'plot-outline': '情节大纲',
    timeline: '时间线及里程碑',
  }
  return targets[view] ?? '故事框架'
}

function knowledgeTarget(view: ModuleSubViewKey) {
  const targets: Partial<Record<ModuleSubViewKey, string>> = {
    'knowledge-overview': '知识库总览',
    'knowledge-facts': '事实与伏笔',
    'knowledge-markdown': '本地 Markdown',
    'knowledge-skills': 'Skill',
    'knowledge-search': '本地全文检索',
  }
  return targets[view] ?? '知识库'
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
  saveLabel = '保存',
  onChange,
  onSave,
}: {
  title: string
  path: string
  value: string
  label: string
  saveLabel?: string
  onChange: (content: string) => void
  onSave: () => void
}) {
  return (
    <section className="agent-block">
      <div className="side-editor-header compact">
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
