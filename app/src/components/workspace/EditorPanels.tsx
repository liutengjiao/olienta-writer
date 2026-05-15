import { useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { WorkspaceProps } from './types'

type ReviewGroup = {
  key: string
  title: string
  tone: 'danger' | 'warning' | 'info'
  items: string[]
}

type InlineDiffChunk = {
  type: 'equal' | 'added' | 'removed'
  text: string
}

const INLINE_DIFF_TOKEN_LIMIT = 900

const REVIEW_GROUPS: Array<Omit<ReviewGroup, 'items'> & { match: (warning: string) => boolean }> = [
  { key: 'timeline', title: '时间线与里程碑', tone: 'danger', match: (warning) => warning.includes('时间线') || warning.includes('里程碑') || warning.includes('提前触发') },
  { key: 'blueprint', title: '章节蓝图', tone: 'danger', match: (warning) => warning.includes('蓝图') || warning.includes('本章必须') || warning.includes('禁区') },
  { key: 'facts', title: '事实库与禁写规则', tone: 'danger', match: (warning) => warning.includes('事实') || warning.includes('禁写') },
  { key: 'characters', title: '角色边界', tone: 'warning', match: (warning) => warning.includes('角色') },
  { key: 'pinned', title: '钉选材料', tone: 'warning', match: (warning) => warning.includes('钉选材料') },
  { key: 'loops', title: '伏笔与回收', tone: 'warning', match: (warning) => warning.includes('伏笔') },
  { key: 'generation', title: '生成与任务书', tone: 'info', match: (warning) => warning.includes('生成来源') || warning.includes('写作任务书') || warning.includes('AI 调用降级') },
  { key: 'quality', title: '文本质量', tone: 'info', match: () => true },
]

export function DraftPanel(props: WorkspaceProps) {
  const candidateUnits = estimateTextUnits(props.candidate)
  const manuscriptUnits = estimateTextUnits(props.manuscript)
  const candidateParagraphs = countParagraphs(props.candidate)
  const manuscriptParagraphs = countParagraphs(props.manuscript)
  const candidateDiff = compareParagraphs(props.candidate, props.manuscript)
  const inlineDiff = compareInlineDiff(props.candidate, props.manuscript)
  const reviewGroups = groupCandidateWarnings(props.candidateWarnings)

  return (
    <section className="draft-workspace">
      <div className="draft-main">
        <section className="chapter-chain">
          <div className="chapter-chain-heading">
            <div>
              <h2>候选稿审查流程</h2>
              <p>AI 输出只停留在候选稿中，必须由作者明确采用后才进入正文。</p>
            </div>
            <span>{props.currentChapter.title}</span>
          </div>
          <div className="chapter-chain-steps">
            <article className="chapter-chain-step confirmed">
              <div><strong>任务书</strong><span>{props.writingBriefPath}</span></div>
              <p>由蓝图、作者输入、事实库、Skill 和钉选材料装配而成。</p>
            </article>
            <article className="chapter-chain-step active">
              <div><strong>候选稿</strong><span>{props.candidatePath}</span></div>
              <p>候选稿可编辑、审查和保存，但不会自动影响已确认正文。</p>
            </article>
            <article className="chapter-chain-step draft">
              <div><strong>正文</strong><span>{props.selectedChapterId}</span></div>
              <p>只有替换或追加才会把候选稿写入已确认章节。</p>
            </article>
          </div>
        </section>

        <MarkdownDocument
          title="候选稿"
          path={props.candidatePath}
          value={props.candidate}
          onChange={props.onChangeCandidate}
          onSave={props.onSaveCandidate}
          actions={
            <>
              <button className="ghost-button" onClick={props.onComposeBrief}>装配任务书</button>
              <button className="ghost-button" onClick={props.onGenerateCandidate}>生成</button>
              <button className="ghost-button" onClick={props.onClearCandidate}>清空</button>
              <button className="ghost-button" onClick={() => props.onAdoptCandidate('append')}>追加</button>
              <button className="primary-button" onClick={() => props.onAdoptCandidate('replace')}>替换</button>
            </>
          }
        />

        <section className="draft-diff-card">
          <div className="card-heading">
            <div>
              <h2>候选稿与正文对比</h2>
              <p>采用前检查候选稿新增段落和正文独有段落。</p>
            </div>
            <span className="status-pill">{props.candidateReviewPath}</span>
          </div>
          <div className="health-strip">
            <article><span>候选稿单位数</span><strong>{candidateUnits}</strong></article>
            <article><span>正文单位数</span><strong>{manuscriptUnits}</strong></article>
            <article><span>段落差值</span><strong>{candidateParagraphs - manuscriptParagraphs}</strong></article>
          </div>
          <div className="diff-columns">
            <article className="diff-column added">
              <div className="candidate-review-group-head">
                <strong>候选稿新增段落</strong>
                <span>{candidateDiff.candidateOnly.length}</span>
              </div>
              <DiffPreviewList
                items={candidateDiff.candidateOnly}
                emptyText="没有发现候选稿相对正文的新增段落。"
              />
            </article>
            <article className="diff-column removed">
              <div className="candidate-review-group-head">
                <strong>正文独有段落</strong>
                <span>{candidateDiff.manuscriptOnly.length}</span>
              </div>
              <DiffPreviewList
                items={candidateDiff.manuscriptOnly}
                emptyText="没有发现正文相对候选稿独有的段落。"
              />
            </article>
          </div>
          <p className="diff-summary">
            共同段落 {candidateDiff.sharedCount} 个。段落对比按规范化后的完整段落匹配，适合采用前快速判断追加或替换风险。
          </p>
          <section className="inline-diff-card">
            <div className="candidate-review-group-head">
              <strong>逐字差异预览</strong>
              <span>{inlineDiff.truncated ? '已截断' : '完整'}</span>
            </div>
            <div className="inline-diff-stats">
              <span>新增 {inlineDiff.addedUnits}</span>
              <span>删减 {inlineDiff.removedUnits}</span>
              <span>相同 {inlineDiff.equalUnits}</span>
            </div>
            <p className="inline-diff-preview">
              {inlineDiff.chunks.length === 0
                ? '候选稿和正文暂无可对比内容。'
                : inlineDiff.chunks.map((chunk, index) => (
                  <span className={`inline-diff-token ${chunk.type}`} key={`${chunk.type}-${index}-${chunk.text}`}>
                    {chunk.text}
                  </span>
                ))}
            </p>
            {inlineDiff.truncated && (
              <p className="diff-more">逐字差异只预览前 {INLINE_DIFF_TOKEN_LIMIT} 个字词单位，长章节仍以段落对比和审查报告为主。</p>
            )}
          </section>
        </section>

        {props.candidateWarnings.length > 0 && (
          <section className="warning-list">
            <div className="card-heading">
              <div>
                <h2>审查清单</h2>
                <p>按风险来源分组；提示不会阻止采用，最终决定仍由作者确认。</p>
              </div>
              <span>{props.candidateWarnings.length}</span>
            </div>
            <div className="candidate-review-groups">
              {reviewGroups.map((group) => (
                <article className={`candidate-review-group ${group.tone}`} key={group.key}>
                  <div className="candidate-review-group-head">
                    <strong>{group.title}</strong>
                    <span>{group.items.length}</span>
                  </div>
                  <ul>
                    {group.items.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>

      <aside className="blueprint-history">
        <div className="panel-heading">
          <h2>历史版本</h2>
          <span>{props.candidateHistory.length}</span>
        </div>
        <div className="compact-list">
          {props.candidateHistory.length === 0 && <p className="empty-note">还没有保存过候选稿历史。</p>}
          {props.candidateHistory.map((item) => (
            <button
              type="button"
              className={`compact-row ${item.relative_path === props.selectedCandidateHistoryPath ? 'active' : ''}`}
              key={item.relative_path}
              onClick={() => props.onLoadCandidateHistory(item.relative_path)}
            >
              <strong>{item.name}</strong>
              <span>{item.relative_path}</span>
              <small>{formatBytes(item.bytes)}</small>
            </button>
          ))}
        </div>
        <textarea
          className="history-preview"
          readOnly
          value={props.candidateHistoryPreview || '选择一个已保存的候选稿版本进行预览。'}
        />
        <button
          type="button"
          className="primary-button"
          disabled={!props.selectedCandidateHistoryPath}
          onClick={props.onRestoreCandidateHistory}
        >
          恢复到编辑器
        </button>
      </aside>
    </section>
  )
}

export function ManuscriptPanel(props: WorkspaceProps) {
  const paragraphCount = countParagraphs(props.manuscript)
  const candidateUnits = estimateTextUnits(props.candidate)

  return (
    <section className="confirmation-grid">
      <div className="confirmation-main">
        <section className="chapter-chain">
          <div className="chapter-chain-heading">
            <div>
              <h2>已确认正文</h2>
              <p>保存本章会记录作者确认，并刷新后续记忆链路。</p>
            </div>
            <span>{props.saveState}</span>
          </div>
          <div className="chapter-chain-steps">
            <article className="chapter-chain-step confirmed">
              <div><strong>章节文件</strong><span>{props.chapterPath}</span></div>
              <p>普通 Markdown 文件仍是已确认正文的真实来源。</p>
            </article>
            <article className="chapter-chain-step draft">
              <div><strong>候选稿可用</strong><span>{candidateUnits}</span></div>
              <p>候选稿只能从草稿箱追加或替换，不会静默进入正文。</p>
            </article>
            <article className="chapter-chain-step active">
              <div><strong>事实库</strong><span>{props.confirmedFactsPath}</span></div>
              <p>大幅编辑后可重扫事实库，从已保存正文刷新确认事实。</p>
            </article>
          </div>
        </section>

        <MarkdownDocument
          title="正文"
          path={props.chapterPath}
          value={props.manuscript}
          onChange={props.onChangeManuscript}
          onSave={props.onSaveChapter}
          actions={
            <>
              <button type="button" className="ghost-button" onClick={props.onToggleFocusMode}>纯写作</button>
              <button type="button" className="ghost-button" onClick={props.onRescanFacts}>重扫事实</button>
              <button type="button" className="ghost-button" onClick={() => props.onExportProject('markdown', 'chapter')}>导出 MD</button>
              <button type="button" className="ghost-button" onClick={() => props.onExportProject('txt', 'chapter')}>导出 TXT</button>
            </>
          }
        />
      </div>

      <aside className="confirmation-side">
        <section className="review-card">
          <div className="panel-heading">
            <h2>章节状态</h2>
            <span>{props.currentChapter.state ?? 'draft'}</span>
          </div>
          <div className="health-strip">
            <article><span>Words</span><strong>{props.manuscriptWordCount}</strong></article>
            <article><span>Units</span><strong>{estimateTextUnits(props.manuscript)}</strong></article>
            <article><span>Paragraphs</span><strong>{paragraphCount}</strong></article>
          </div>
        </section>

        <section className="review-card">
          <div className="panel-heading">
            <h2>作者确认</h2>
            <span>本地日志</span>
          </div>
          <p className="empty-note">保存会写入确认摘要和事件记录；除非明确采用候选稿，否则 AI 文本不会进入正文。</p>
          <div className="editor-actions">
            <button type="button" className="primary-button" onClick={props.onSaveChapter}>保存已确认正文</button>
            <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile('facts/author-confirmation.md')}>打开日志</button>
          </div>
        </section>

        <section className="review-card">
          <div className="panel-heading">
            <h2>Memory</h2>
            <span>{props.openLoopsPath}</span>
          </div>
          <p className="empty-note">事实和伏笔都保存为普通 Markdown 文件，作者可以直接查看和编辑。</p>
          <div className="editor-actions">
            <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile(props.confirmedFactsPath)}>事实库</button>
            <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile(props.openLoopsPath)}>伏笔</button>
          </div>
        </section>

        <section className="review-card">
          <div className="panel-heading">
            <h2>导出当前章</h2>
            <span>{props.lastExportedPath || '尚未导出'}</span>
          </div>
          <div className="editor-actions">
            <button type="button" className="ghost-button" onClick={() => props.onExportProject('markdown', 'chapter')}>MD</button>
            <button type="button" className="ghost-button" onClick={() => props.onExportProject('txt', 'chapter')}>TXT</button>
            <button type="button" className="ghost-button" onClick={() => props.onExportProject('docx', 'chapter')}>DOCX</button>
          </div>
        </section>
      </aside>
    </section>
  )
}

export function MarkdownDocument(props: {
  title: string
  path: string
  value: string
  onChange: (value: string) => void
  onSave: () => void
  actions?: ReactNode
}) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const stats = getMarkdownStats(props.value)

  function updateValue(nextValue: string, selectionStart?: number, selectionEnd?: number) {
    props.onChange(nextValue)
    if (selectionStart === undefined || selectionEnd === undefined) return
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(selectionStart, selectionEnd)
    })
  }

  function applyAction(action: MarkdownAction) {
    const textarea = textareaRef.current
    if (!textarea) return
    const next = applyMarkdownAction(props.value, textarea.selectionStart, textarea.selectionEnd, action)
    updateValue(next.value, next.selectionStart, next.selectionEnd)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const action = markdownActionForKey(event)
    if (!action) return
    event.preventDefault()
    applyAction(action)
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const html = event.clipboardData.getData('text/html')
    const text = event.clipboardData.getData('text/plain')
    const cleaned = html ? htmlToMarkdown(html) : cleanPastedText(text)
    if (!cleaned) return
    event.preventDefault()
    const textarea = textareaRef.current
    if (!textarea) return
    const next = replaceSelection(props.value, textarea.selectionStart, textarea.selectionEnd, cleaned)
    updateValue(next.value, next.selectionStart, next.selectionEnd)
  }

  return (
    <section className="editor-card module-document-panel">
      <div className="card-heading">
        <div><h2>{props.title}</h2><p>{props.path}</p></div>
        <div className="editor-actions">
          <button className="ghost-button" onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>
            {mode === 'edit' ? '预览' : '编辑'}
          </button>
          {props.actions}
          <button className="primary-button" onClick={props.onSave}>保存</button>
        </div>
      </div>
      {mode === 'edit' && (
        <div className="markdown-editor-shell">
          <div className="markdown-toolbar" aria-label="Markdown tools">
            {MARKDOWN_ACTIONS.map((tool) => (
              <button
                type="button"
                key={tool.action}
                title={tool.title}
                onClick={() => applyAction(tool.action)}
              >
                {tool.label}
              </button>
            ))}
            <span className="shortcut-hint">Ctrl+B / Ctrl+` / Tab</span>
          </div>
          <textarea
            ref={textareaRef}
            className="markdown-preview source"
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
          />
          <div className="markdown-editor-meta">
            <span>{stats.lines} 行</span>
            <span>{stats.paragraphs} 段</span>
            <span>{stats.units} 字/词</span>
          </div>
        </div>
      )}
      {mode === 'preview' && (
        <div className="markdown-rendered local-markdown-rendered">
          {renderMarkdownPreview(props.value)}
        </div>
      )}
    </section>
  )
}

type MarkdownAction =
  | 'h1'
  | 'h2'
  | 'bold'
  | 'quote'
  | 'list'
  | 'inline-code'
  | 'code-block'
  | 'hr'
  | 'clean'

const MARKDOWN_ACTIONS: Array<{ action: MarkdownAction; label: string; title: string }> = [
  { action: 'h1', label: 'H1', title: '一级标题' },
  { action: 'h2', label: 'H2', title: '二级标题' },
  { action: 'bold', label: 'B', title: '加粗' },
  { action: 'quote', label: '>', title: '引用' },
  { action: 'list', label: '- ', title: '列表' },
  { action: 'inline-code', label: '`', title: '行内代码' },
  { action: 'code-block', label: '{}', title: '代码块' },
  { action: 'hr', label: '---', title: '分隔线' },
  { action: 'clean', label: '清理', title: '清理多余空白' },
]

function markdownActionForKey(event: KeyboardEvent<HTMLTextAreaElement>): MarkdownAction | null {
  const command = event.ctrlKey || event.metaKey
  if (event.key === 'Tab') return 'list'
  if (!command) return null
  const key = event.key.toLowerCase()
  if (key === 'b') return 'bold'
  if (key === '`') return 'inline-code'
  if (event.shiftKey && key === 'x') return 'clean'
  if (event.altKey && key === '1') return 'h1'
  if (event.altKey && key === '2') return 'h2'
  if (event.altKey && key === 'q') return 'quote'
  if (event.shiftKey && key === '7') return 'list'
  if (key === '-') return 'hr'
  return null
}

function applyMarkdownAction(value: string, selectionStart: number, selectionEnd: number, action: MarkdownAction) {
  if (action === 'clean') {
    const cleaned = cleanMarkdownWhitespace(value)
    return { value: cleaned, selectionStart: Math.min(selectionStart, cleaned.length), selectionEnd: Math.min(selectionEnd, cleaned.length) }
  }
  if (action === 'bold') return wrapSelection(value, selectionStart, selectionEnd, '**', '**', '加粗文本')
  if (action === 'inline-code') return wrapSelection(value, selectionStart, selectionEnd, '`', '`', 'code')
  if (action === 'code-block') return wrapSelection(value, selectionStart, selectionEnd, '```\n', '\n```', '代码')
  if (action === 'hr') return insertBlock(value, selectionStart, selectionEnd, '\n\n---\n\n')
  if (action === 'h1') return prefixSelectedLines(value, selectionStart, selectionEnd, '# ')
  if (action === 'h2') return prefixSelectedLines(value, selectionStart, selectionEnd, '## ')
  if (action === 'quote') return prefixSelectedLines(value, selectionStart, selectionEnd, '> ')
  return prefixSelectedLines(value, selectionStart, selectionEnd, '- ')
}

function replaceSelection(value: string, selectionStart: number, selectionEnd: number, replacement: string) {
  const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`
  const cursor = selectionStart + replacement.length
  return { value: nextValue, selectionStart: cursor, selectionEnd: cursor }
}

function wrapSelection(value: string, selectionStart: number, selectionEnd: number, before: string, after: string, placeholder: string) {
  const selected = value.slice(selectionStart, selectionEnd) || placeholder
  const replacement = `${before}${selected}${after}`
  const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`
  return {
    value: nextValue,
    selectionStart: selectionStart + before.length,
    selectionEnd: selectionStart + before.length + selected.length,
  }
}

function insertBlock(value: string, selectionStart: number, selectionEnd: number, block: string) {
  const nextValue = `${value.slice(0, selectionStart)}${block}${value.slice(selectionEnd)}`
  const cursor = selectionStart + block.length
  return { value: nextValue, selectionStart: cursor, selectionEnd: cursor }
}

function prefixSelectedLines(value: string, selectionStart: number, selectionEnd: number, prefix: string) {
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
  const lineEndIndex = value.indexOf('\n', selectionEnd)
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex
  const block = value.slice(lineStart, lineEnd)
  const nextBlock = block
    .split('\n')
    .map((line) => `${prefix}${line.replace(/^(#{1,6}\s+|>\s+|-\s+)/, '')}`)
    .join('\n')
  const nextValue = `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`
  const added = nextBlock.length - block.length
  return {
    value: nextValue,
    selectionStart: selectionStart + prefix.length,
    selectionEnd: selectionEnd + added,
  }
}

function cleanMarkdownWhitespace(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .concat('\n')
}

function cleanPastedText(value: string) {
  return value.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim()
}

function htmlToMarkdown(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return cleanPastedText(Array.from(doc.body.childNodes).map(nodeToMarkdown).join('\n\n'))
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  if (!(node instanceof HTMLElement)) return ''
  const content = Array.from(node.childNodes).map(nodeToMarkdown).filter(Boolean).join(' ').trim()
  const tag = node.tagName.toLowerCase()
  if (tag === 'h1') return `# ${content}`
  if (tag === 'h2') return `## ${content}`
  if (tag === 'h3') return `### ${content}`
  if (tag === 'blockquote') return content.split('\n').map((line) => `> ${line}`).join('\n')
  if (tag === 'li') return `- ${content}`
  if (tag === 'ul' || tag === 'ol') return Array.from(node.children).map(nodeToMarkdown).join('\n')
  if (tag === 'strong' || tag === 'b') return `**${content}**`
  if (tag === 'code') return `\`${content}\``
  if (tag === 'pre') return `\`\`\`\n${node.textContent?.trim() ?? ''}\n\`\`\``
  if (tag === 'br') return '\n'
  return content
}

function renderMarkdownPreview(value: string) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  const output: ReactNode[] = []
  let paragraph: string[] = []
  let listItems: string[] = []
  let codeLines: string[] = []
  let inCode = false

  function flushParagraph() {
    if (paragraph.length === 0) return
    output.push(<p key={`p-${output.length}`}>{renderInlineMarkdown(paragraph.join(' '))}</p>)
    paragraph = []
  }

  function flushList() {
    if (listItems.length === 0) return
    output.push(<ul key={`ul-${output.length}`}>{listItems.map((item, index) => <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>)}</ul>)
    listItems = []
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        output.push(<pre key={`code-${output.length}`}><code>{codeLines.join('\n')}</code></pre>)
        codeLines = []
        inCode = false
      } else {
        flushParagraph()
        flushList()
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeLines.push(line)
      continue
    }
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph()
      flushList()
      continue
    }
    if (/^---+$/.test(trimmed)) {
      flushParagraph()
      flushList()
      output.push(<hr key={`hr-${output.length}`} />)
      continue
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (heading) {
      flushParagraph()
      flushList()
      const level = heading[1].length
      const text = heading[2]
      if (level === 1) output.push(<h1 key={`h1-${output.length}`}>{renderInlineMarkdown(text)}</h1>)
      else if (level === 2) output.push(<h2 key={`h2-${output.length}`}>{renderInlineMarkdown(text)}</h2>)
      else output.push(<h3 key={`h3-${output.length}`}>{renderInlineMarkdown(text)}</h3>)
      continue
    }
    if (trimmed.startsWith('> ')) {
      flushParagraph()
      flushList()
      output.push(<blockquote key={`quote-${output.length}`}>{renderInlineMarkdown(trimmed.slice(2))}</blockquote>)
      continue
    }
    if (trimmed.startsWith('- ')) {
      flushParagraph()
      listItems.push(trimmed.slice(2))
      continue
    }
    paragraph.push(trimmed)
  }

  flushParagraph()
  flushList()
  if (inCode) output.push(<pre key={`code-${output.length}`}><code>{codeLines.join('\n')}</code></pre>)
  return output.length > 0 ? output : <p>暂无内容。</p>
}

function renderInlineMarkdown(value: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let lastIndex = 0
  for (const match of value.matchAll(pattern)) {
    if (match.index > lastIndex) nodes.push(value.slice(lastIndex, match.index))
    const token = match[0]
    if (token.startsWith('`')) nodes.push(<code key={`${token}-${match.index}`}>{token.slice(1, -1)}</code>)
    else nodes.push(<strong key={`${token}-${match.index}`}>{token.slice(2, -2)}</strong>)
    lastIndex = match.index + token.length
  }
  if (lastIndex < value.length) nodes.push(value.slice(lastIndex))
  return nodes
}

function getMarkdownStats(value: string) {
  return {
    lines: value ? value.split(/\r\n?|\n/).length : 0,
    paragraphs: countParagraphs(value),
    units: estimateTextUnits(value),
  }
}

export function ChapterList(props: WorkspaceProps) {
  return (
    <aside className="chapter-list-panel">
      {props.chapters.map((chapter) => (
        <button
          className={`chapter-list-item ${chapter.id === props.selectedChapterId ? 'active' : ''}`}
          key={chapter.id}
          onClick={() => props.onSelectChapter(chapter.id)}
        >
          <span>{chapter.id}</span>
          <strong>{chapter.title}</strong>
          <small>{chapter.words} 字</small>
        </button>
      ))}
    </aside>
  )
}

export function FocusMode(props: WorkspaceProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const stats = getMarkdownStats(props.manuscript)

  function updateValue(nextValue: string, selectionStart?: number, selectionEnd?: number) {
    props.onChangeManuscript(nextValue)
    if (selectionStart === undefined || selectionEnd === undefined) return
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(selectionStart, selectionEnd)
    })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const action = markdownActionForKey(event)
    if (!action) return
    event.preventDefault()
    const next = applyMarkdownAction(
      props.manuscript,
      event.currentTarget.selectionStart,
      event.currentTarget.selectionEnd,
      action,
    )
    updateValue(next.value, next.selectionStart, next.selectionEnd)
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const html = event.clipboardData.getData('text/html')
    const text = event.clipboardData.getData('text/plain')
    const cleaned = html ? htmlToMarkdown(html) : cleanPastedText(text)
    if (!cleaned) return
    event.preventDefault()
    const next = replaceSelection(
      props.manuscript,
      event.currentTarget.selectionStart,
      event.currentTarget.selectionEnd,
      cleaned,
    )
    updateValue(next.value, next.selectionStart, next.selectionEnd)
  }

  return (
    <section className="focus-mode">
      <div className="focus-topbar">
        <strong>{props.currentChapter.title}</strong>
        <span>{props.saveState}</span>
        <button onClick={props.onSaveChapter}>保存</button>
      </div>
      <textarea
        ref={textareaRef}
        value={props.manuscript}
        onChange={(event) => props.onChangeManuscript(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />
      <div className="focus-meta">
        <span>{stats.lines} 行</span>
        <span>{stats.paragraphs} 段</span>
        <span>{stats.units} 字/词</span>
      </div>
    </section>
  )
}

function groupCandidateWarnings(warnings: string[]): ReviewGroup[] {
  const groups = REVIEW_GROUPS.map((group) => ({ ...group, items: [] as string[] }))

  for (const warning of warnings) {
    const group = groups.find((item) => item.match(warning)) ?? groups[groups.length - 1]
    group.items.push(warning)
  }

  return groups
    .filter((group) => group.items.length > 0)
    .map(({ key, title, tone, items }) => ({ key, title, tone, items }))
}

function DiffPreviewList(props: { items: string[]; emptyText: string }) {
  if (props.items.length === 0) {
    return <p className="empty-note">{props.emptyText}</p>
  }

  const previewItems = props.items.slice(0, 6)
  const hiddenCount = props.items.length - previewItems.length

  return (
    <>
      <ul>
        {previewItems.map((item) => (
          <li key={item}>{trimDiffParagraph(item)}</li>
        ))}
      </ul>
      {hiddenCount > 0 && <p className="diff-more">还有 {hiddenCount} 个段落未展开。</p>}
    </>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return `${Math.round(bytes / 1024)} KB`
}

function estimateTextUnits(content: string) {
  const trimmed = content.trim()
  if (!trimmed) return 0
  const latinWords = trimmed.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g)?.length ?? 0
  const cjkChars = trimmed.match(/[\u3400-\u9fff]/g)?.length ?? 0
  return latinWords + cjkChars
}

function countParagraphs(content: string) {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean).length
}

function compareParagraphs(candidate: string, manuscript: string) {
  const candidateParagraphs = toComparableParagraphs(candidate)
  const manuscriptParagraphs = toComparableParagraphs(manuscript)
  const manuscriptSet = new Set(manuscriptParagraphs.map((item) => item.normalized))
  const candidateSet = new Set(candidateParagraphs.map((item) => item.normalized))

  return {
    candidateOnly: candidateParagraphs
      .filter((item) => !manuscriptSet.has(item.normalized))
      .map((item) => item.original),
    manuscriptOnly: manuscriptParagraphs
      .filter((item) => !candidateSet.has(item.normalized))
      .map((item) => item.original),
    sharedCount: candidateParagraphs.filter((item) => manuscriptSet.has(item.normalized)).length,
  }
}

function compareInlineDiff(candidate: string, manuscript: string) {
  const candidateTokens = tokenizeInlineDiff(candidate).slice(0, INLINE_DIFF_TOKEN_LIMIT)
  const manuscriptTokens = tokenizeInlineDiff(manuscript).slice(0, INLINE_DIFF_TOKEN_LIMIT)
  const truncated =
    tokenizeInlineDiff(candidate).length > INLINE_DIFF_TOKEN_LIMIT ||
    tokenizeInlineDiff(manuscript).length > INLINE_DIFF_TOKEN_LIMIT
  const chunks = mergeInlineDiffChunks(diffTokens(manuscriptTokens, candidateTokens))
  return {
    chunks: trimInlineDiffChunks(chunks),
    addedUnits: chunks.filter((chunk) => chunk.type === 'added').reduce((sum, chunk) => sum + diffUnitCount(chunk.text), 0),
    removedUnits: chunks.filter((chunk) => chunk.type === 'removed').reduce((sum, chunk) => sum + diffUnitCount(chunk.text), 0),
    equalUnits: chunks.filter((chunk) => chunk.type === 'equal').reduce((sum, chunk) => sum + diffUnitCount(chunk.text), 0),
    truncated,
  }
}

function tokenizeInlineDiff(content: string) {
  return content
    .replace(/[#>*_`-]+/g, ' ')
    .match(/[\u3400-\u9fff]|[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*|[^\s]/g) ?? []
}

function diffTokens(baseTokens: string[], nextTokens: string[]): InlineDiffChunk[] {
  const rows = baseTokens.length + 1
  const cols = nextTokens.length + 1
  const table = Array.from({ length: rows }, () => Array(cols).fill(0) as number[])

  for (let row = baseTokens.length - 1; row >= 0; row -= 1) {
    for (let col = nextTokens.length - 1; col >= 0; col -= 1) {
      table[row][col] = baseTokens[row] === nextTokens[col]
        ? table[row + 1][col + 1] + 1
        : Math.max(table[row + 1][col], table[row][col + 1])
    }
  }

  const chunks: InlineDiffChunk[] = []
  let row = 0
  let col = 0
  while (row < baseTokens.length && col < nextTokens.length) {
    if (baseTokens[row] === nextTokens[col]) {
      chunks.push({ type: 'equal', text: baseTokens[row] })
      row += 1
      col += 1
    } else if (table[row + 1][col] >= table[row][col + 1]) {
      chunks.push({ type: 'removed', text: baseTokens[row] })
      row += 1
    } else {
      chunks.push({ type: 'added', text: nextTokens[col] })
      col += 1
    }
  }
  while (row < baseTokens.length) {
    chunks.push({ type: 'removed', text: baseTokens[row] })
    row += 1
  }
  while (col < nextTokens.length) {
    chunks.push({ type: 'added', text: nextTokens[col] })
    col += 1
  }
  return chunks
}

function mergeInlineDiffChunks(chunks: InlineDiffChunk[]) {
  const merged: InlineDiffChunk[] = []
  for (const chunk of chunks) {
    const last = merged[merged.length - 1]
    if (last?.type === chunk.type) {
      last.text = joinDiffTokenText(last.text, chunk.text)
    } else {
      merged.push({ ...chunk })
    }
  }
  return merged
}

function trimInlineDiffChunks(chunks: InlineDiffChunk[]) {
  const importantIndexes = chunks
    .map((chunk, index) => chunk.type === 'equal' ? -1 : index)
    .filter((index) => index >= 0)
  if (importantIndexes.length === 0) return chunks.slice(0, 1)
  const start = Math.max(0, importantIndexes[0] - 2)
  const end = Math.min(chunks.length, importantIndexes[importantIndexes.length - 1] + 3)
  const output = chunks.slice(start, end)
  if (start > 0) output.unshift({ type: 'equal', text: '...' })
  if (end < chunks.length) output.push({ type: 'equal', text: '...' })
  return output
}

function joinDiffTokenText(left: string, right: string) {
  if (left === '...' || right === '...') return `${left}${right}`
  if (/^[\u3400-\u9fff]$/.test(right) || /^[,.;:!?，。；：！？、）】》]$/.test(right)) return `${left}${right}`
  if (/^[（【《]$/.test(right)) return `${left}${right}`
  return `${left} ${right}`
}

function diffUnitCount(text: string) {
  return tokenizeInlineDiff(text).length
}

function toComparableParagraphs(content: string) {
  const seen = new Set<string>()
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({
      original: paragraph,
      normalized: paragraph.replace(/\s+/g, ' ').trim(),
    }))
    .filter((paragraph) => {
      if (seen.has(paragraph.normalized)) return false
      seen.add(paragraph.normalized)
      return true
    })
}

function trimDiffParagraph(paragraph: string) {
  const compact = paragraph.replace(/\s+/g, ' ').trim()
  if (compact.length <= 140) return compact
  return `${compact.slice(0, 140)}...`
}
