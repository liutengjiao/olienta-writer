import { useEffect, useRef, useState } from 'react'
import * as tauriApi from '../api/tauriApi'
import { isTauriRuntime } from '../constants'
import type {
  AiChatMessage,
  CandidateReviewIssue,
  ChapterSummary,
  FrameworkFileSummary,
  ModuleKey,
  ModuleSubViewKey,
  SkillFileSummary,
  ViewKey,
} from '../types'

type Props = {
  activeModule: ModuleKey
  activeModuleView: ModuleSubViewKey
  activeView: ViewKey
  projectRoot: string
  assistantState: string
  chapters: ChapterSummary[]
  currentChapter: ChapterSummary
  selectedChapterId: string
  chapterPath: string
  manuscript: string
  writingBrief: string
  frameworkPath: string
  frameworkFiles: FrameworkFileSummary[]
  selectedFrameworkFile: string
  frameworkContent: string
  frameworkDraftContent: string
  frameworkDraftPath: string
  frameworkDraftSourceContent: string
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
  candidateReviewIssues: CandidateReviewIssue[]
  candidatePath: string
  candidateReviewPath: string
  candidate: string
  candidateGenerationRunning: boolean
  candidateGenerationStatus: string
  skillFiles: SkillFileSummary[]
  onClose: () => void
  hidden?: boolean
  onSelectChapter: (chapterId: string) => void
  onOpenProjectFile: (relativePath: string) => void
  onComposeBrief: () => void
  onGenerateFrameworkDraft: () => void
  onSaveFrameworkFile: () => void
  onSaveFrameworkDraftAsOfficial: () => void
  onSelectFrameworkFile: (fileName: string) => void
  onChangeFrameworkContent: (content: string) => void
  onChangeFrameworkDraftContent: (content: string) => void
  onSaveBlueprint: () => void
  onChangeBlueprint: (content: string) => void
  onGenerateBlueprintDraft: () => void
  onRegenerateAllBlueprints: () => void
  onSaveAuthorInput: () => void
  onChangeAuthorInput: (content: string) => void
  onSaveKnowledgeFile: (kind: 'confirmed-facts' | 'open-loops') => void
  onChangeConfirmedFacts: (content: string) => void
  onChangeOpenLoops: (content: string) => void
  onRescanFacts: (kind?: 'confirmed-facts' | 'open-loops' | 'forbidden-rules', authorInput?: string) => void
  onSaveAiProviders: () => Promise<boolean>
  onTestAiProvider: () => void
  onChangeAiProvidersJson: (content: string) => void
  onChangeWritingBrief: (content: string) => void
  onChangeCandidate: (content: string) => void
  onGenerateCandidate: () => void
  onCancelCandidateGeneration: () => void
  onSaveCandidate: () => void
  onSaveAgentReplyAsCandidate: (content: string) => Promise<void> | void
  onSaveAgentReplyAsBlueprintDraft: (content: string) => Promise<void> | void
  onSaveAgentReplyAsBlueprintOfficial: (content: string) => Promise<void> | void
  onSaveAgentReplyAsManuscriptOfficial: (content: string) => Promise<void> | void
  onClearCandidate: () => void
  onAdoptCandidate: () => void
}

type AgentKind = 'settings' | 'framework' | 'blueprint' | 'draft' | 'chapter' | 'knowledge' | 'provider' | 'general'

type AgentContext = {
  kind: AgentKind
  title: string
  target: string
  path: string
  policy: string
  contextItems: string[]
}

export function AgentPanel(props: Props) {
  const context = getAgentContext(props.activeModule, props.activeModuleView, props.activeView)
  const effectiveActiveView = agentActiveView(context, props)
  const contextKey = agentContextKey(context, props, effectiveActiveView)
  const [chatInputs, setChatInputs] = useState<Record<string, string>>({})
  const [chatMessagesByContext, setChatMessagesByContext] = useState<Record<string, AiChatMessage[]>>(() => loadLocalAgentChatHistory(props.projectRoot))
  const [chatEventsByContext, setChatEventsByContext] = useState<Record<string, string[]>>({})
  const [chatStatusByContext, setChatStatusByContext] = useState<Record<string, string>>({})
  const [chatRunning, setChatRunning] = useState(false)
  const [savingMessageIndex, setSavingMessageIndex] = useState<number | null>(null)
  const [includeCurrentEditor, setIncludeCurrentEditor] = useState(true)
  const chatRequestRef = useRef('')
  const chatRequestSeqRef = useRef(0)
  const chatStartedAtRef = useRef(0)
  const chatContextKeyRef = useRef(contextKey)
  const chatHistoryLoadedRef = useRef(!isTauriRuntime)
  const chatHistoryProjectRef = useRef(props.projectRoot)

  const activeSkills = props.skillFiles.filter((file) => !file.disabled)
  const frameworkFocused = context.kind === 'framework' || context.kind === 'settings'
  const blueprintFocused = context.kind === 'blueprint'
  const chapterFocused = context.kind === 'chapter' || context.kind === 'draft'
  const knowledgeFocused = context.kind === 'knowledge'
  const providerFocused = context.kind === 'provider'
  const selectedFrameworkStem = props.selectedFrameworkFile.replace(/\.md$/i, '')
  const draftMatchesCurrentFramework =
    props.frameworkDraftPath.includes(`framework/drafts/${selectedFrameworkStem}-`) ||
    props.frameworkDraftPath.includes(`framework/drafts/${selectedFrameworkStem}.`)
  const hasFrameworkDraft =
    frameworkFocused &&
    props.frameworkDraftContent.trim().length > 0 &&
    (!props.frameworkDraftPath || draftMatchesCurrentFramework)
  const chapterLinks = buildChapterLinks(props.chapters, props.selectedChapterId)
  const chatInput = chatInputs[contextKey] ?? ''
  const chatMessages = chatMessagesByContext[contextKey] ?? []
  const chatEvents = chatEventsByContext[contextKey] ?? []
  const chatStatus = chatStatusByContext[contextKey] ?? ''
  const latestAssistantMessage = chatMessages
    .filter((message) => message.role === 'assistant' && !isFailureMessage(message.content))
    .at(-1)

  useEffect(() => {
    chatHistoryLoadedRef.current = !isTauriRuntime
    chatHistoryProjectRef.current = props.projectRoot
    Promise.resolve().then(() => {
      if (chatHistoryProjectRef.current === props.projectRoot) {
        setChatMessagesByContext(loadLocalAgentChatHistory(props.projectRoot))
      }
    })
    if (!isTauriRuntime || !props.projectRoot.trim()) return
    let cancelled = false
    tauriApi.loadAgentChatHistory(props.projectRoot)
      .then((document) => {
        if (cancelled || chatHistoryProjectRef.current !== props.projectRoot) return
        const loaded = parseAgentChatHistory(document.content)
        setChatMessagesByContext(loaded)
        saveLocalAgentChatHistory(props.projectRoot, loaded)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled && chatHistoryProjectRef.current === props.projectRoot) {
          chatHistoryLoadedRef.current = true
        }
      })
    return () => {
      cancelled = true
    }
  }, [props.projectRoot])

  useEffect(() => {
    saveLocalAgentChatHistory(props.projectRoot, chatMessagesByContext)
    if (!isTauriRuntime || !props.projectRoot.trim() || !chatHistoryLoadedRef.current) return
    const timer = window.setTimeout(() => {
      const compact = compactAgentChatHistory(chatMessagesByContext)
      void tauriApi.saveAgentChatHistory(props.projectRoot, JSON.stringify(compact)).catch(() => undefined)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [props.projectRoot, chatMessagesByContext])

  useEffect(() => {
    chatContextKeyRef.current = contextKey
  }, [contextKey])

  function setCurrentChatInput(value: string) {
    setChatInputs((current) => ({ ...current, [contextKey]: value }))
  }

  function setCurrentChatMessages(messages: AiChatMessage[]) {
    setChatMessagesByContext((current) => ({ ...current, [contextKey]: messages }))
  }

  function setCurrentChatEvents(events: string[]) {
    setChatEventsByContext((current) => ({ ...current, [contextKey]: events }))
  }

  function setCurrentChatStatus(status: string) {
    setChatStatusByContext((current) => ({ ...current, [contextKey]: status }))
  }

  useEffect(() => {
    if (!chatRunning || !chatStartedAtRef.current) return
    const timer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Number(new Date()) - chatStartedAtRef.current) / 1000)
      const slowHint = elapsedSeconds >= 45 ? '，模型仍在思考，可以继续等待或停止后重试' : ''
      const key = chatContextKeyRef.current
      setChatStatusByContext((current) => ({ ...current, [key]: `正在生成回复，已用 ${elapsedSeconds}s${slowHint}` }))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [chatRunning])

  function pushChatEvent(message: string) {
    const key = contextKey
    setChatEventsByContext((current) => ({
      ...current,
      [key]: [...(current[key] ?? []).slice(-5), `${new Date().toLocaleTimeString()} ${message}`],
    }))
  }

  function buildClientContextItems() {
    if (!includeCurrentEditor) return []
    if (frameworkFocused) {
      return [
        { label: context.target, path: props.frameworkPath, content: props.frameworkContent },
      ]
    }
    if (blueprintFocused) {
      return [{ label: '当前章节蓝图', path: props.blueprintPath, content: props.blueprint }]
    }
    if (context.kind === 'chapter') {
      return [{ label: '当前正文', path: props.chapterPath, content: props.manuscript }]
    }
    if (context.kind === 'draft') {
      return [{ label: '当前候选稿', path: props.candidatePath, content: props.candidate }]
    }
    return []
  }

  async function sendChatMessage() {
    const content = chatInput.trim()
    if (!content || chatRunning) return
    await sendChatContent([...chatMessages, { role: 'user', content }], contextKey)
  }

  async function regenerateLastChatMessage() {
    if (chatRunning) return
    const lastUserMessage = [...chatMessages].reverse().find((message) => message.role === 'user')
    if (!lastUserMessage?.content.trim()) return
    const nextMessages = chatMessages.filter((message, index) => (
      index < chatMessages.length - 1 || message.role !== 'assistant'
    ))
    await sendChatContent(nextMessages, contextKey)
  }

  async function sendChatContent(nextMessages: AiChatMessage[], requestContextKey: string) {
    setCurrentChatEvents([])
    setCurrentChatInput('')
    setChatRunning(true)
    chatStartedAtRef.current = Number(new Date())
    setCurrentChatMessages(nextMessages)
    setCurrentChatStatus('正在调用 AI...')
    pushChatEvent('已提交给 AI Provider')
    chatRequestSeqRef.current += 1
    const requestId = `agent-chat-${props.selectedChapterId}-${chatRequestSeqRef.current}`
    chatRequestRef.current = requestId

    try {
      if (!isTauriRuntime || !props.projectRoot) {
        setChatStatusByContext((current) => ({ ...current, [requestContextKey]: '预览模式不可调用' }))
        pushChatEvent('浏览器预览不能调用本机保存的 API。请使用桌面版 Olienta。')
        return
      }
      const result = await tauriApi.aiChat({
        rootPath: props.projectRoot,
        chapterId: props.selectedChapterId,
        contextKind: context.kind,
        activeView: effectiveActiveView,
        requestId,
        clientContext: buildClientContextItems(),
        messages: nextMessages,
      })
      if (chatRequestRef.current !== requestId) return
      const warnings = result.warnings?.length ? `\n\n---\n\n生成提醒：\n${result.warnings.map((warning) => `- ${warning}`).join('\n')}` : ''
      if (result.contextSnapshotPath) pushChatEvent(`上下文快照：${result.contextSnapshotPath}`)
      setChatStatusByContext((current) => ({ ...current, [requestContextKey]: result.usedRemoteModel ? `已由 ${result.provider} 回复` : result.provider }))
      pushChatEvent(result.usedRemoteModel ? `收到 ${result.provider} 回复` : '返回本地诊断')
      if (result.content.trim()) {
        setChatMessagesByContext((current) => ({ ...current, [requestContextKey]: [...nextMessages, { role: 'assistant', content: `${result.content}${warnings}` }] }))
      }
    } catch (error) {
      if (chatRequestRef.current !== requestId) return
      setChatStatusByContext((current) => ({ ...current, [requestContextKey]: '调用失败，可以重试' }))
      pushChatEvent(`调用失败：${String(error)}`)
    } finally {
      if (chatRequestRef.current === requestId) {
        chatRequestRef.current = ''
        setChatRunning(false)
        chatStartedAtRef.current = 0
      }
    }
  }

  function cancelChatMessage() {
    const requestId = chatRequestRef.current
    if (!requestId) return
    chatRequestRef.current = ''
    setChatRunning(false)
    chatStartedAtRef.current = 0
    setCurrentChatStatus('已停止，稍后返回的 Provider 结果会被忽略。')
    if (isTauriRuntime) void tauriApi.cancelAiRequest(requestId).catch(() => undefined)
  }

  async function saveReplyAsCandidate(content: string, index: number) {
    if (!chapterFocused || savingMessageIndex !== null) return
    setSavingMessageIndex(index)
    try {
      await props.onSaveAgentReplyAsCandidate(content)
      setCurrentChatStatus(`已保存为第 ${props.selectedChapterId} 章草稿版本`)
    } catch (error) {
      setCurrentChatStatus(`保存草稿失败：${String(error)}`)
    } finally {
      setSavingMessageIndex(null)
    }
  }

  async function saveReplyAsFrameworkDraft(content: string, index: number) {
    if (!frameworkFocused || savingMessageIndex !== null) return
    setSavingMessageIndex(index)
    const stem = props.selectedFrameworkFile.replace(/\.md$/i, '') || 'framework'
    const relativePath = `framework/drafts/${stem}-agent-${props.selectedChapterId}-${index + 1}.md`
    try {
      await tauriApi.saveModuleMarkdownFile(props.projectRoot, relativePath, content)
      props.onChangeFrameworkDraftContent(content)
      setCurrentChatStatus(`已保存为草稿：${relativePath}`)
    } catch (error) {
      setCurrentChatStatus(`保存草稿失败：${String(error)}`)
    } finally {
      setSavingMessageIndex(null)
    }
  }

  async function saveReplyAsFrameworkOfficial(content: string, index: number) {
    if (!frameworkFocused || savingMessageIndex !== null) return
    setSavingMessageIndex(index)
    try {
      await tauriApi.saveFrameworkFile(props.projectRoot, props.selectedFrameworkFile, content)
      props.onChangeFrameworkContent(content)
      setCurrentChatStatus(`已保存为正式稿件：${props.frameworkPath}`)
    } catch (error) {
      setCurrentChatStatus(`保存正稿失败：${String(error)}`)
    } finally {
      setSavingMessageIndex(null)
    }
  }

  async function saveFrameworkDraft() {
    if (!props.frameworkDraftPath || !props.frameworkDraftContent.trim()) {
      setCurrentChatStatus('还没有可以保存的框架草稿。')
      return
    }
    try {
      await tauriApi.saveModuleMarkdownFile(props.projectRoot, props.frameworkDraftPath, props.frameworkDraftContent)
      setCurrentChatStatus(`已保存为草稿：${props.frameworkDraftPath}`)
    } catch (error) {
      setCurrentChatStatus(`保存草稿失败：${String(error)}`)
    }
  }

  async function saveReplyAsBlueprintDraft(content: string, index: number) {
    if (!blueprintFocused || savingMessageIndex !== null) return
    setSavingMessageIndex(index)
    try {
      await props.onSaveAgentReplyAsBlueprintDraft(content)
      setCurrentChatStatus('已保存为蓝图草稿')
    } catch (error) {
      setCurrentChatStatus(`保存蓝图草稿失败：${String(error)}`)
    } finally {
      setSavingMessageIndex(null)
    }
  }

  async function saveReplyAsBlueprintOfficial(content: string, index: number) {
    if (!blueprintFocused || savingMessageIndex !== null) return
    setSavingMessageIndex(index)
    try {
      await props.onSaveAgentReplyAsBlueprintOfficial(content)
      setCurrentChatStatus('已保存为本章正式蓝图')
    } catch (error) {
      setCurrentChatStatus(`保存正式蓝图失败：${String(error)}`)
    } finally {
      setSavingMessageIndex(null)
    }
  }

  async function saveReplyAsManuscriptOfficial(content: string, index: number) {
    if (!(context.kind === 'chapter') || savingMessageIndex !== null) return
    setSavingMessageIndex(index)
    try {
      await props.onSaveAgentReplyAsManuscriptOfficial(content)
      setCurrentChatStatus(`已替换并保存第 ${props.selectedChapterId} 章正文`)
    } catch (error) {
      setCurrentChatStatus(`保存正文失败：${String(error)}`)
    } finally {
      setSavingMessageIndex(null)
    }
  }

  return (
    <aside className="agent-panel" aria-label="AI助手" hidden={props.hidden}>
      <header className="agent-header">
        <div>
          <h2>AI助手</h2>
          <p>{context.target}</p>
        </div>
        <button type="button" className="agent-close" onClick={props.onClose} aria-label="隐藏AI助手">X</button>
      </header>

      <section className="agent-chat-card" aria-label="AI 对话">
        <div className="side-editor-header compact">
          <div>
            <h3>{chapterFocused ? '作者的思考' : context.target}</h3>
            <p>{chatStatus || '输入内容会和真实上下文一起发送给 AI。'}</p>
          </div>
        </div>
        {chatEvents.length > 0 && (
          <ol className="agent-status-feed" aria-label="AI 调用状态">
            {chatEvents.map((event, index) => <li key={`${event}-${index}`}>{event}</li>)}
          </ol>
        )}
        {chatMessages.length > 0 && (
          <div className="agent-chat-history" aria-label="对话记录">
            <strong>对话记录</strong>
            <div>
              {chatMessages.map((message, index) => (
                <article key={`${message.role}-${index}`} className={`agent-history-message ${message.role}`}>
                  <span>{message.role === 'user' ? '你' : 'AI'}</span>
                  <p>{message.content}</p>
                </article>
              ))}
            </div>
          </div>
        )}
        <div className="agent-chat-input">
          <textarea
            value={chatInput}
            onChange={(event) => setCurrentChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void sendChatMessage()
              }
            }}
            placeholder="像网页版 AI 一样随意写：找茬、给创意、续写、评估、改写、生成新草稿..."
            disabled={chatRunning}
          />
          {chatRunning ? (
            <button type="button" onClick={cancelChatMessage}>停止</button>
          ) : (
            <button type="button" className="primary" onClick={() => void sendChatMessage()} disabled={!chatInput.trim()}>生成</button>
          )}
        </div>
        <label className="agent-context-toggle compact-toggle">
          <input type="checkbox" checked={includeCurrentEditor} onChange={(event) => setIncludeCurrentEditor(event.target.checked)} />
          <span>生成时加入当前左侧文稿</span>
        </label>
        {latestAssistantMessage && (
          <div className="agent-generated-result" aria-live="polite">
            <div className="side-editor-header compact">
              <div>
                <h3>生成结果</h3>
                <p>对话记录在上方保留，这里只显示本次可处理内容。</p>
              </div>
            </div>
            <article className="agent-chat-message assistant">
              <textarea className="agent-generated-output" value={latestAssistantMessage.content} readOnly />
              {frameworkFocused && (
                <div className="agent-message-actions">
                  <button type="button" className="ghost-button" onClick={() => void regenerateLastChatMessage()} disabled={savingMessageIndex !== null || chatRunning}>重新生成</button>
                  <button type="button" className="ghost-button" onClick={() => void saveReplyAsFrameworkDraft(latestAssistantMessage.content, 0)} disabled={savingMessageIndex !== null}>保存为草稿</button>
                  <button type="button" className="primary" onClick={() => void saveReplyAsFrameworkOfficial(latestAssistantMessage.content, 0)} disabled={savingMessageIndex !== null}>保存为正式稿件</button>
                </div>
              )}
              {blueprintFocused && (
                <div className="agent-message-actions">
                  <button type="button" className="ghost-button" onClick={() => void regenerateLastChatMessage()} disabled={savingMessageIndex !== null || chatRunning}>重新生成</button>
                  <button type="button" className="ghost-button" onClick={() => void saveReplyAsBlueprintDraft(latestAssistantMessage.content, 0)} disabled={savingMessageIndex !== null}>保存为草稿</button>
                  <button type="button" className="primary" onClick={() => void saveReplyAsBlueprintOfficial(latestAssistantMessage.content, 0)} disabled={savingMessageIndex !== null}>保存为正式稿件</button>
                </div>
              )}
              {context.kind === 'chapter' && (
                <div className="agent-message-actions">
                  <button type="button" className="ghost-button" onClick={() => void regenerateLastChatMessage()} disabled={savingMessageIndex !== null || chatRunning}>重新生成</button>
                  <button type="button" className="ghost-button" onClick={() => void saveReplyAsCandidate(latestAssistantMessage.content, 0)} disabled={savingMessageIndex !== null}>保存为草稿</button>
                  <button type="button" className="primary" onClick={() => void saveReplyAsManuscriptOfficial(latestAssistantMessage.content, 0)} disabled={savingMessageIndex !== null}>保存为正文</button>
                </div>
              )}
              {context.kind === 'draft' && (
                <div className="agent-message-actions">
                  <button type="button" className="ghost-button" onClick={() => void regenerateLastChatMessage()} disabled={savingMessageIndex !== null || chatRunning}>重新生成</button>
                  <button type="button" className="ghost-button" onClick={() => void saveReplyAsCandidate(latestAssistantMessage.content, 0)} disabled={savingMessageIndex !== null}>保存为草稿</button>
                  <button type="button" className="primary" onClick={props.onAdoptCandidate} disabled={savingMessageIndex !== null}>保存为正文</button>
                </div>
              )}
            </article>
          </div>
        )}
      </section>

      {chapterFocused && (
        <section className="agent-block agent-chapter-links">
          <h3>上下文列表</h3>
          <div className="agent-link-list">
            {chapterLinks.previous ? <button type="button" onClick={() => props.onSelectChapter(chapterLinks.previous!.id)}>上一章：{formatChapterLinkTitle(chapterLinks.previous)}</button> : <span>上一章：无</span>}
            {chapterLinks.next ? <button type="button" onClick={() => props.onSelectChapter(chapterLinks.next!.id)}>下一章：{formatChapterLinkTitle(chapterLinks.next)}</button> : <span>下一章：无</span>}
          </div>
          <div className="agent-link-list compact">
            <button type="button" onClick={() => props.onOpenProjectFile(props.confirmedFactsPath)}>事实库</button>
            <button type="button" onClick={() => props.onOpenProjectFile(props.openLoopsPath)}>伏笔</button>
          </div>
        </section>
      )}

      <section className="agent-compose">
        {context.kind === 'draft' && (
          <>
            <button type="button" onClick={props.onClearCandidate}>清空候选稿</button>
            <button type="button" className="primary" onClick={props.onGenerateCandidate} disabled={props.candidateGenerationRunning}>{props.candidateGenerationRunning ? '生成中' : '生成候选稿'}</button>
            {props.candidateGenerationRunning && <button type="button" onClick={props.onCancelCandidateGeneration}>取消生成</button>}
          </>
        )}
        {knowledgeFocused && <button type="button" className="primary" onClick={() => props.onRescanFacts('confirmed-facts')}>再次生成事实库</button>}
        {providerFocused && <><button type="button" className="primary" onClick={props.onTestAiProvider}>测试 Provider</button><button type="button" onClick={props.onSaveAiProviders}>保存 Provider</button></>}
      </section>

      {frameworkFocused && hasFrameworkDraft && (
        <section className="agent-block framework-draft-compare has-draft">
          <div className="side-editor-header compact">
            <div>
              <h3>生成结果比对</h3>
              <p>{props.frameworkDraftPath || '已生成草稿'}</p>
            </div>
          </div>
          <textarea className="agent-small-editor framework-generated-editor" value={props.frameworkDraftContent} onChange={(event) => props.onChangeFrameworkDraftContent(event.target.value)} />
          <div className="framework-draft-actions">
            <button type="button" className="ghost-button" onClick={props.onGenerateFrameworkDraft}>重新生成</button>
            <button type="button" className="ghost-button" onClick={() => void saveFrameworkDraft()}>保存为草稿</button>
            <button type="button" className="primary" onClick={props.onSaveFrameworkDraftAsOfficial}>保存为正式稿件</button>
            {props.frameworkDraftPath && <button type="button" className="ghost-button" onClick={() => props.onOpenProjectFile(props.frameworkDraftPath)}>定位草稿</button>}
          </div>
          <p className="empty-note">保存为正式稿件会覆盖当前框架文件；保存为草稿不会改动原正式稿件；重新生成会替换当前右侧草稿。</p>
        </section>
      )}

      {frameworkFocused && (
        <details className="agent-details" open>
          <summary>框架文件</summary>
          <section className="agent-block readonly-reference-block">
            <div className="side-editor-header compact"><div><h3>故事框架</h3><p>{props.frameworkPath}</p></div></div>
            <select className="framework-select" value={props.selectedFrameworkFile} onChange={(event) => props.onSelectFrameworkFile(event.target.value)}>
              {props.frameworkFiles.length === 0 ? <option value="01-setting.md">01-setting.md</option> : props.frameworkFiles.map((file) => <option key={file.relative_path} value={file.name}>{file.name}</option>)}
            </select>
            <textarea className="agent-small-editor readonly-reference-editor" value={props.frameworkContent} readOnly />
          </section>
        </details>
      )}

      {!frameworkFocused && !chapterFocused && (
        <section className="agent-block">
          <h3>本次生成会参考</h3>
          <ul className="agent-context-list">
            {context.contextItems.map((item) => <li key={item}>{item}</li>)}
            <li>已启用 Skill：{activeSkills.length === 0 ? '暂无' : activeSkills.map((file) => file.name).join('、')}</li>
          </ul>
        </section>
      )}
    </aside>
  )
}

function isFailureMessage(content: string) {
  return (
    content.startsWith('调用失败') ||
    content.includes('这次对话调用失败') ||
    content.includes('provider response read failed') ||
    content.includes('error decoding response body')
  )
}

function agentChatStorageKey(projectRoot: string) {
  const normalized = projectRoot.trim().replace(/[\\/]+$/g, '').replaceAll('\\', '/').toLowerCase()
  let hash = 0
  for (const char of normalized) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  return `olienta.agent-chat.${Math.abs(hash)}`
}

function parseAgentChatHistory(raw: string): Record<string, AiChatMessage[]> {
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, AiChatMessage[]>
    return compactAgentChatHistory(parsed)
  } catch {
    return {}
  }
}

function loadLocalAgentChatHistory(projectRoot: string): Record<string, AiChatMessage[]> {
  if (!projectRoot.trim()) return {}
  try {
    const raw = window.localStorage.getItem(agentChatStorageKey(projectRoot))
    return raw ? parseAgentChatHistory(raw) : {}
  } catch {
    return {}
  }
}

function compactAgentChatHistory(messagesByContext: Record<string, AiChatMessage[]>) {
  return Object.fromEntries(
    Object.entries(messagesByContext)
      .map(([key, messages]) => [
        key,
        Array.isArray(messages)
          ? messages.filter((message) => (
            (message.role === 'user' || message.role === 'assistant') &&
            typeof message.content === 'string' &&
            message.content.trim().length > 0
          )).slice(-40)
          : [],
      ] as const)
      .filter(([, messages]) => messages.length > 0),
  )
}

function saveLocalAgentChatHistory(projectRoot: string, messagesByContext: Record<string, AiChatMessage[]>) {
  if (!projectRoot.trim()) return
  const compact = compactAgentChatHistory(messagesByContext)
  try {
    window.localStorage.setItem(agentChatStorageKey(projectRoot), JSON.stringify(compact))
  } catch {
    // Local chat history is best-effort and must not block writing.
  }
}

function getAgentContext(module: ModuleKey, moduleView: ModuleSubViewKey, view: ViewKey): AgentContext {
  if (view === 'novel-settings') return { kind: 'settings', title: '小说结构助手', target: '小说结构', path: 'framework/01-setting.md', policy: '框架草稿先保存为草稿，作者确认后才覆盖正稿。', contextItems: ['作者输入', '故事梗概', '启用 Skill', '事实库'] }
  if (module === 'characters' && moduleView === 'characters-overview') return { kind: 'framework', title: '故事框架助手', target: '角色图谱', path: 'framework/03-characters.md', policy: '框架草稿不会直接覆盖正稿。', contextItems: ['当前框架文件', '其它故事框架文件', '启用 Skill'] }
  if (['story-premise', 'characters', 'world', 'plot-outline', 'important-scenes', 'timeline'].includes(view)) return { kind: 'framework', title: '故事框架助手', target: frameworkTarget(view), path: 'framework/*.md', policy: '框架草稿不会直接覆盖正稿。', contextItems: ['当前框架文件', '其它故事框架文件', '启用 Skill'] }
  if (view === 'chapter-blueprint') return { kind: 'blueprint', title: '章节蓝图助手', target: '当前章节蓝图', path: 'blueprints/chapters/*.md', policy: '蓝图保存会影响后续章节。', contextItems: ['当前章节蓝图', '故事框架', '事实库', '启用 Skill'] }
  if (view === 'draft-box') return { kind: 'draft', title: 'AI助手', target: '当前章节候选稿', path: 'manuscript/candidates/*.md', policy: '候选稿必须由作者明确采用。', contextItems: ['当章蓝图', '前文正文', '事实库', '启用 Skill'] }
  if (view === 'manuscript') return { kind: 'chapter', title: 'AI助手', target: '作者的思考', path: 'manuscript/chapters/*.md', policy: '正文是最高优先级文本。', contextItems: ['当前正文', '当章蓝图', '事实库', '启用 Skill'] }
  if (module === 'knowledge') return { kind: 'knowledge', title: '知识库助手', target: '知识库', path: 'facts/、knowledge/、skills/', policy: '知识库文件保存后进入后续上下文。', contextItems: ['已确认事实', '未闭合伏笔', 'Skill'] }
  if (module === 'model-calls') return { kind: 'provider', title: '模型调用助手', target: 'AI Provider', path: '软件设置/ai-providers.json', policy: 'Provider 配置保存并测试后用于真实生成。', contextItems: ['Provider 配置', '调用记录'] }
  return { kind: 'general', title: 'AI助手', target: '当前页面', path: moduleView, policy: '根据当前页面协助作者。', contextItems: ['当前项目上下文'] }
}

function frameworkTarget(view: ViewKey) {
  const targets: Partial<Record<ViewKey, string>> = {
    'story-premise': '故事梗概',
    characters: '角色图谱',
    world: '世界观',
    'plot-outline': '情节大纲',
    'important-scenes': '重要场景',
    timeline: '时间线及里程碑',
  }
  return targets[view] ?? '故事框架'
}

function agentActiveView(context: AgentContext, props: Props): ViewKey {
  if (context.kind === 'framework' && context.path === 'framework/03-characters.md') return 'characters'
  return props.activeView
}

function agentContextKey(context: AgentContext, props: Props, activeView: ViewKey) {
  if (context.kind === 'framework' || context.kind === 'settings') {
    return `${context.kind}:${activeView}:${props.selectedFrameworkFile}`
  }
  if (context.kind === 'blueprint' || context.kind === 'chapter' || context.kind === 'draft') {
    return `${context.kind}:${activeView}:${props.selectedChapterId}`
  }
  return `${context.kind}:${props.activeModule}:${props.activeModuleView}:${activeView}`
}

function buildChapterLinks(chapters: ChapterSummary[], selectedChapterId: string) {
  const currentIndex = chapters.findIndex((chapter) => chapter.id === selectedChapterId)
  return {
    previous: currentIndex > 0 ? chapters[currentIndex - 1] : null,
    next: currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null,
  }
}

function formatChapterLinkTitle(chapter: ChapterSummary | null) {
  if (!chapter) return ''
  const number = Number.parseInt(chapter.id, 10)
  const prefix = Number.isFinite(number) ? `第${String(number).padStart(2, '0')}章` : `第${chapter.id}章`
  const cleanTitle = chapter.title.replace(/^第\s*\d+\s*章[:：\s]*/u, '').trim()
  return cleanTitle ? `${prefix} ${cleanTitle}` : prefix
}
