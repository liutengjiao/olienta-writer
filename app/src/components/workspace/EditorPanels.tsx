import { useState } from 'react'
import type { WorkspaceProps } from './types'

export function DraftPanel(props: WorkspaceProps) {
  const candidateUnits = estimateTextUnits(props.candidate)
  const manuscriptUnits = estimateTextUnits(props.manuscript)
  const candidateParagraphs = countParagraphs(props.candidate)
  const manuscriptParagraphs = countParagraphs(props.manuscript)

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
              <p>采用前的轻量审查统计。</p>
            </div>
            <span className="status-pill">{props.candidateReviewPath}</span>
          </div>
          <div className="health-strip">
            <article><span>候选稿单位数</span><strong>{candidateUnits}</strong></article>
            <article><span>正文单位数</span><strong>{manuscriptUnits}</strong></article>
            <article><span>段落差值</span><strong>{candidateParagraphs - manuscriptParagraphs}</strong></article>
          </div>
        </section>

        {props.candidateWarnings.length > 0 && (
          <section className="warning-list">
            <div className="card-heading">
              <h2>审查提醒</h2>
              <span>{props.candidateWarnings.length}</span>
            </div>
            <ul>
              {props.candidateWarnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
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
          <p className="empty-note">事实和伏笔都存为普通 Markdown 文件，作者可以直接查看和编辑。</p>
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
  actions?: React.ReactNode
}) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
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
      {mode === 'edit'
        ? <textarea className="markdown-preview source" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
        : <pre className="markdown-rendered local-markdown-rendered">{props.value || '暂无内容。'}</pre>}
    </section>
  )
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
          <small>{chapter.word_count ?? 0} 字</small>
        </button>
      ))}
    </aside>
  )
}

export function FocusMode(props: WorkspaceProps) {
  return (
    <section className="focus-mode">
      <div className="focus-topbar">
        <strong>{props.currentChapter.title}</strong>
        <span>{props.saveState}</span>
        <button onClick={props.onSaveChapter}>保存</button>
      </div>
      <textarea value={props.manuscript} onChange={(event) => props.onChangeManuscript(event.target.value)} />
    </section>
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
