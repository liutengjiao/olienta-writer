import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { CandidateReviewIssue, ContractFulfillmentSummary } from '../../types'
import type { WorkspaceProps } from './types'
import { MarkdownEditorKernel, type MarkdownEditorKernelHandle } from './MarkdownEditorKernel'
import * as tauriApi from '../../api/tauriApi'
import {
  candidateTextForAdoption,
  cleanPastedText,
  compareInlineDiff,
  compareParagraphs,
  compareSimilarParagraphs,
  countParagraphs,
  estimateTextUnits,
  findKnowledgeHitsForParagraph,
  type MarkdownAction,
  type KnowledgeHit,
} from '../../lib/editorLogic'

type ReviewGroup = {
  key: string
  title: string
  tone: 'danger' | 'warning' | 'info'
  items: CandidateReviewIssue[]
}

const INLINE_DIFF_TOKEN_LIMIT = 900

const REVIEW_GROUPS: Array<Omit<ReviewGroup, 'items'> & { match: (issue: CandidateReviewIssue) => boolean }> = [
  { key: 'revision', title: '本轮回修目标', tone: 'danger', match: (issue) => issue.category === 'revision' },
  { key: 'timeline', title: '时间线与里程碑', tone: 'danger', match: (issue) => issue.category === 'timeline' },
  { key: 'blueprint', title: '章节蓝图', tone: 'danger', match: (issue) => issue.category === 'blueprint' },
  { key: 'facts', title: '事实库与禁写规则', tone: 'danger', match: (issue) => issue.category === 'fact' || issue.category === 'setting' },
  { key: 'characters', title: '角色边界', tone: 'warning', match: (issue) => issue.category === 'character' },
  { key: 'pinned', title: '钉选材料', tone: 'warning', match: (issue) => issue.category === 'context' },
  { key: 'loops', title: '伏笔与回收', tone: 'warning', match: (issue) => issue.category === 'continuity' },
  { key: 'style', title: '文风指纹', tone: 'warning', match: (issue) => issue.category === 'style' || issue.description.includes('Style Fingerprint') },
  { key: 'generation', title: '生成与本章写作要求', tone: 'info', match: (issue) => issue.category === 'generation' },
  { key: 'quality', title: '文本质量', tone: 'info', match: () => true },
]

function StyleFingerprintCard(props: {
  rootPath: string
  writingBrief: string
  onRefresh: () => void
  onReveal: () => void
}) {
  const [editingControls, setEditingControls] = useState(false)
  const [styleControls, setStyleControls] = useState('')
  const [styleControlsStatus, setStyleControlsStatus] = useState('')
  const lines = extractStyleFingerprintLines(props.writingBrief)
  const hasFingerprint = lines.some((line) => !line.includes('Not enough confirmed manuscript yet'))

  useEffect(() => {
    if (!props.rootPath || !editingControls) return
    let cancelled = false
    tauriApi.loadFrameworkFile(props.rootPath, '06-style.md')
      .then((document) => {
        if (cancelled) return
        setStyleControls(document.content)
        setStyleControlsStatus(`已读取 ${document.relative_path}`)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setStyleControlsStatus(error instanceof Error ? error.message : '读取文风配置失败')
      })
    return () => {
      cancelled = true
    }
  }, [props.rootPath, editingControls])

  function toggleEditingControls() {
    const next = !editingControls
    setEditingControls(next)
    if (next) setStyleControlsStatus('正在读取文风配置')
  }

  async function saveStyleControls() {
    if (!props.rootPath) return
    setStyleControlsStatus('正在保存文风配置')
    try {
      const saved = await tauriApi.saveFrameworkFile(props.rootPath, '06-style.md', styleControls)
      setStyleControls(saved.content)
      setStyleControlsStatus(`已保存 ${saved.relative_path}`)
      props.onRefresh()
    } catch (error) {
      setStyleControlsStatus(error instanceof Error ? error.message : '保存文风配置失败')
    }
  }

  return (
    <section className="style-fingerprint-card">
      <div className="card-heading">
        <div>
          <h3>文风指纹</h3>
          <p>{hasFingerprint ? '已从确认正文提取当前项目声音基线。' : '确认正文不足时会显示待生成状态。'}</p>
        </div>
        <div className="inline-actions">
          <button type="button" className="ghost-button" onClick={props.onRefresh}>刷新</button>
          <button type="button" className="ghost-button" onClick={toggleEditingControls}>
            {editingControls ? '收起规则' : '编辑规则'}
          </button>
          <button type="button" className="ghost-button" onClick={props.onReveal} disabled={!hasFingerprint}>打开快照</button>
        </div>
      </div>
      <ul>
        {lines.map((line) => (
          <li key={line}>{line.replace(/^- /, '')}</li>
        ))}
      </ul>
      {editingControls && (
        <div className="style-controls-editor">
          <textarea
            value={styleControls}
            onChange={(event) => setStyleControls(event.target.value)}
            spellCheck={false}
            aria-label="文风人工约束"
            placeholder={'# 文风配置\n\n- 锁定：保持某类意象或句式\n- 禁用：不要出现的短语\n'}
          />
          <div>
            <span>{styleControlsStatus}</span>
            <button type="button" className="primary-button" onClick={() => void saveStyleControls()} disabled={!props.rootPath}>
              保存规则并刷新
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function extractStyleFingerprintLines(writingBrief: string) {
  const marker = '## Style Fingerprint v1'
  const start = writingBrief.indexOf(marker)
  if (start < 0) {
    return ['尚未生成本章写作要求。点击刷新后会根据已确认正文生成文风指纹。']
  }

  const rest = writingBrief.slice(start + marker.length)
  const nextHeading = rest.search(/\n##\s+/)
  const section = nextHeading >= 0 ? rest.slice(0, nextHeading) : rest
  const lines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))

  return lines.length > 0 ? lines : ['尚未识别到可展示的文风指纹。']
}

export function DraftPanel(props: WorkspaceProps) {
  const [pendingReplacementKey, setPendingReplacementKey] = useState('')
  const candidateUnits = estimateTextUnits(props.candidate)
  const manuscriptUnits = estimateTextUnits(props.manuscript)
  const candidateParagraphs = countParagraphs(props.candidate)
  const manuscriptParagraphs = countParagraphs(props.manuscript)
  const candidateDiff = compareParagraphs(props.candidate, props.manuscript)
  const inlineDiff = compareInlineDiff(props.candidate, props.manuscript)
  const paragraphInlineDiffs = compareSimilarParagraphs(props.candidate, props.manuscript)
  const candidateReviewIssues = props.candidateReviewIssues.length > 0
    ? props.candidateReviewIssues
    : props.candidateWarnings.map(issueFromWarning)
  const reviewGroups = groupCandidateReviewIssues(candidateReviewIssues)
  const revisionReviewIssues = candidateReviewIssues.filter((issue) => issue.category === 'revision')
  const timelineReviewGroup = reviewGroups.find((group) => group.key === 'timeline')
  const insertionLabel = formatSelectionLabel(props.manuscriptSelection, props.manuscript.length)
  const candidateSelectionLabel = formatCandidateSelectionLabel(props.candidateSelection, props.candidate)
  const candidateForAdoption = candidateTextForAdoption(props.candidate, props.candidateSelection)
  const insertDisabled = candidateForAdoption.trim().length === 0
  const activePendingReplacementKey = paragraphInlineDiffs.some(
    (item) => paragraphPairKey(item.candidate, item.manuscript) === pendingReplacementKey,
  )
    ? pendingReplacementKey
    : ''

  return (
    <section className="draft-workspace">
      <div className="draft-main">
        <section className="chapter-chain">
          <div className="chapter-chain-heading">
            <div>
              <h2>正文草稿审查流程</h2>
              <p>AI 输出只停留在候选稿中，必须由作者明确采用后才进入正文。</p>
            </div>
            <div className="chapter-chain-actions">
              <span>{props.currentChapter.title}</span>
              <button type="button" className="ghost-button" onClick={() => props.onSelectView('manuscript')}>
                返回本章正文
              </button>
            </div>
          </div>
          <div className="chapter-chain-steps">
            <article className="chapter-chain-step confirmed">
              <div><strong>本章写作要求</strong><span>{props.writingBriefPath}</span></div>
              <p>由蓝图、作者输入、事实库、Skill 和钉选材料装配而成。</p>
            </article>
            <article className="chapter-chain-step active">
              <div><strong>候选稿</strong><span>{props.candidatePath}</span></div>
              <p>候选稿可编辑、审查和保存，但不会自动影响已确认正文。</p>
            </article>
            <article className="chapter-chain-step draft">
              <div><strong>正文</strong><span>{props.selectedChapterId}</span></div>
              <p>只有作者点击追加、插入或替换后，候选稿才会写入已确认章节。</p>
            </article>
          </div>
        </section>

        <section className="candidate-safety-card">
          <div>
            <strong>候选稿不会自动进入正文</strong>
            <span>生成、保存、审查候选稿都只影响正文草稿版本。正文只有在你明确采用后才改变。</span>
          </div>
          <div>
            <strong>采用前先看范围和位置</strong>
            <span>下方会显示当前采用的是候选稿选区还是整份候选稿，以及会写入正文哪里。</span>
          </div>
          <div>
            <strong>替换整章正文是高风险动作</strong>
            <span>正文已有内容时，优先考虑追加或插入；替换会用候选稿覆盖当前章正文。</span>
          </div>
        </section>

        <StyleFingerprintCard
          rootPath={props.project?.root_path ?? ''}
          writingBrief={props.writingBrief}
          onRefresh={props.onComposeBrief}
          onReveal={() => props.onRevealProjectPath('.olienta/style-fingerprint.md')}
        />

        <MarkdownDocument
          title="候选稿"
          path={props.candidatePath}
          value={props.candidate}
          onChange={props.onChangeCandidate}
          onSave={props.onSaveCandidate}
          onSelectionChange={props.onChangeCandidateSelection}
          restoreSelection={props.candidateRestoreSelection}
          readOnly={props.isProjectReadOnly}
          actions={
            props.isProjectReadOnly ? undefined : <>
              <button className="ghost-button" onClick={props.onComposeBrief}>生成本章写作要求</button>
              <button className="ghost-button" onClick={props.onGenerateCandidate} disabled={props.candidateGenerationRunning}>
                {props.candidateGenerationRunning ? '生成中' : '生成候选稿'}
              </button>
              {props.candidateGenerationRunning && (
                <button className="ghost-button danger" onClick={props.onCancelCandidateGeneration}>取消生成</button>
              )}
              <button className="ghost-button" onClick={props.onClearCandidate}>清空</button>
              <button className="ghost-button" onClick={() => props.onAdoptCandidate('append')} disabled={insertDisabled}>追加到正文末尾</button>
              <button className="ghost-button" onClick={() => props.onAdoptCandidate('insert')} disabled={insertDisabled}>插入光标到正文</button>
              <button className="primary-button danger" onClick={() => props.onAdoptCandidate('replace')} disabled={insertDisabled}>替换整章正文</button>
            </>
          }
        />
        <p className="empty-note">{props.candidateGenerationStatus}</p>
        <RevisionTargetStatusCard
          issues={revisionReviewIssues}
          revisionPath={`tasks/contract-revisions/${props.selectedChapterId}.md`}
          candidatePath={props.candidatePath}
          generationRunning={props.candidateGenerationRunning}
          onComposeBrief={props.onComposeBrief}
          onGenerateCandidate={props.onGenerateCandidate}
          onRevealProjectPath={props.onRevealProjectPath}
        />
        <section className="candidate-adoption-card">
          <div>
            <strong>采用位置</strong>
            <span>{insertionLabel}</span>
          </div>
          <div>
            <strong>采用范围</strong>
            <span>{candidateSelectionLabel}</span>
          </div>
          <p>
            候选稿有选区时只采用选中内容；没有选区时采用整份候选稿。插入到正文光标会替换正文当前选区；如果没有记录到光标位置，则默认插入到正文末尾。替换整章正文会覆盖当前章正文。
          </p>
        </section>
        {props.recentParagraphReplacement && (
          <section className="paragraph-replacement-undo-card">
            <div>
              <strong>最近段落替换</strong>
              <button type="button" className="ghost-button" onClick={props.onUndoParagraphReplacement}>撤销替换</button>
            </div>
            <p><span>原正文：</span>{props.recentParagraphReplacement.manuscriptPreview}</p>
            <p><span>候选段：</span>{props.recentParagraphReplacement.candidatePreview}</p>
          </section>
        )}

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
                onLocate={(item) => props.onLocateCandidateText(item)}
                onInsert={(item) => props.onAdoptCandidateText(item, 'insert')}
                onAppend={(item) => props.onAdoptCandidateText(item, 'append')}
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
                onLocate={(item) => props.onLocateManuscriptText(item)}
              />
            </article>
          </div>
          <p className="diff-summary">
            共同段落 {candidateDiff.sharedCount} 个。段落对比按规范化后的完整段落匹配，适合采用前快速判断追加或替换风险。
          </p>
          <section className="paragraph-inline-diff-card">
            <div className="candidate-review-group-head">
              <strong>相似段落逐字对比</strong>
              <span>{paragraphInlineDiffs.length}</span>
            </div>
            {paragraphInlineDiffs.length === 0 ? (
              <p className="empty-note">没有发现足够相似但内容不同的段落。</p>
            ) : (
              <div className="paragraph-inline-diff-list">
                {paragraphInlineDiffs.map((item, index) => (
                  <ParagraphInlineDiffItem
                    activePendingReplacementKey={activePendingReplacementKey}
                    candidate={item.candidate}
                    confirmedFacts={props.confirmedFacts}
                    forbiddenRules={props.forbiddenRules}
                    index={index}
                    inlineDiff={item.inlineDiff}
                    manuscript={item.manuscript}
                    onAdoptCandidateText={props.onAdoptCandidateText}
                    onLocateCandidateText={props.onLocateCandidateText}
                    onLocateManuscriptText={props.onLocateManuscriptText}
                    onOpenKnowledgeHit={props.onOpenKnowledgeHit}
                    onReplaceManuscriptParagraph={props.onReplaceManuscriptParagraph}
                    openLoops={props.openLoops}
                    setPendingReplacementKey={setPendingReplacementKey}
                    similarity={item.similarity}
                    key={`${item.similarity}-${index}-${item.candidate}`}
                  />
                ))}
              </div>
            )}
          </section>
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

        {candidateReviewIssues.length > 0 && (
          <section className="warning-list">
            <div className="card-heading">
              <div>
                <h2>审查清单</h2>
                <p>按风险来源分组；提示不会阻止采用，最终决定仍由作者确认。</p>
              </div>
              <span>{candidateReviewIssues.length}</span>
            </div>
            <div className="candidate-review-groups">
              {timelineReviewGroup && (
                <TimelineReviewPanel
                  eventsPath={props.timelineEventsPath}
                  milestonesPath={props.timelineMilestonesPath}
                  onRevealProjectPath={props.onRevealProjectPath}
                  issues={timelineReviewGroup.items}
                />
              )}
              {reviewGroups.map((group) => (
                <article className={`candidate-review-group ${group.tone}`} key={group.key}>
                  <div className="candidate-review-group-head">
                    <strong>{group.title}</strong>
                    <span>{group.items.length}</span>
                  </div>
                  <ul>
                    {group.items.map((issue) => (
                      <li className={`candidate-review-issue ${issue.severity}`} key={`${issue.category}-${issue.location}-${issue.description}`}>
                        <strong>{formatReviewSeverity(issue.severity)} · {formatReviewCategory(issue.category)}</strong>
                        <span>{issue.description}</span>
                        <small>{issue.location} · {issue.fix_hint}</small>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  )
}

function ParagraphInlineDiffItem(props: {
  activePendingReplacementKey: string
  candidate: string
  manuscript: string
  similarity: number
  index: number
  inlineDiff: ReturnType<typeof compareInlineDiff>
  confirmedFacts: string
  openLoops: string
  forbiddenRules: string
  onLocateCandidateText: (content: string) => void
  onLocateManuscriptText: (content: string) => void
  onAdoptCandidateText: (content: string, mode?: 'append' | 'insert') => void
  onReplaceManuscriptParagraph: (candidateParagraph: string, manuscriptParagraph: string) => void
  onOpenKnowledgeHit: (kind: KnowledgeHit['kind'], text: string) => void
  setPendingReplacementKey: (key: string) => void
}) {
  const pairKey = paragraphPairKey(props.candidate, props.manuscript)
  const pending = props.activePendingReplacementKey === pairKey
  const knowledgeHits = findKnowledgeHitsForParagraph(props.candidate, {
    confirmedFacts: props.confirmedFacts,
    openLoops: props.openLoops,
    forbiddenRules: props.forbiddenRules,
  })

  return (
    <article
      className={`paragraph-inline-diff-item ${pending ? 'pending' : ''}`}
      key={`${props.similarity}-${props.index}-${props.candidate}`}
    >
      <div className="paragraph-inline-diff-head">
        <strong>相似度 {props.similarity}%</strong>
        <span className="diff-preview-actions">
          <button type="button" className="ghost-button" onClick={() => props.onLocateCandidateText(props.candidate)}>定位候选稿</button>
          <button type="button" className="ghost-button" onClick={() => props.onLocateManuscriptText(props.manuscript)}>定位正文</button>
          <button type="button" className="ghost-button" onClick={() => props.onAdoptCandidateText(props.candidate, 'insert')}>插入候选段</button>
          {pending ? (
            <>
              <button type="button" className="ghost-button danger" onClick={() => {
                props.setPendingReplacementKey('')
                props.onReplaceManuscriptParagraph(props.candidate, props.manuscript)
              }}>确认替换</button>
              <button type="button" className="ghost-button" onClick={() => props.setPendingReplacementKey('')}>取消</button>
            </>
          ) : (
            <button type="button" className="ghost-button danger" onClick={() => props.setPendingReplacementKey(pairKey)}>替换正文段</button>
          )}
        </span>
      </div>
      <KnowledgeHitList hits={knowledgeHits} onOpenKnowledgeHit={props.onOpenKnowledgeHit} />
      {pending && (
        <p className="replace-confirm-note">将用这段候选稿替换配对的正文段。确认后会立即保存正文并写入作者确认记录。</p>
      )}
      <p className="inline-diff-preview compact">
        {props.inlineDiff.chunks.map((chunk, chunkIndex) => (
          <span className={`inline-diff-token ${chunk.type}`} key={`${chunk.type}-${chunkIndex}-${chunk.text}`}>
            {chunk.text}
          </span>
        ))}
      </p>
    </article>
  )
}

function KnowledgeHitList(props: {
  hits: KnowledgeHit[]
  onOpenKnowledgeHit: (kind: KnowledgeHit['kind'], text: string) => void
}) {
  if (props.hits.length === 0) {
    return <p className="knowledge-hit-empty">未命中事实、伏笔或禁写规则。</p>
  }

  return (
    <div className="knowledge-hit-list">
      {props.hits.map((hit) => (
        <button
          type="button"
          className={`knowledge-hit ${hit.kind}`}
          key={`${hit.kind}-${hit.text}`}
          onClick={() => props.onOpenKnowledgeHit(hit.kind, hit.text)}
          title="打开来源并定位"
        >
          <span>{hit.label}</span>
          {hit.text}
        </button>
      ))}
    </div>
  )
}

function RevisionTargetStatusCard(props: {
  issues: CandidateReviewIssue[]
  revisionPath: string
  candidatePath: string
  generationRunning: boolean
  onComposeBrief: () => void
  onGenerateCandidate: () => void
  onRevealProjectPath: (relativePath: string) => void
}) {
  const completed = props.issues.filter((issue) => issue.description.includes('回修目标完成'))
  const pending = props.issues.filter((issue) => issue.description.includes('回修目标未完成'))
  const hasRevisionTargets = props.issues.length > 0
  const regenerateForRevisionTargets = () => {
    props.onComposeBrief()
    props.onGenerateCandidate()
  }

  return (
    <section className={`revision-target-card ${pending.length > 0 ? 'risk' : hasRevisionTargets ? 'clear' : 'empty'}`}>
      <div className="candidate-review-group-head">
        <strong>本轮回修目标</strong>
        <span>{hasRevisionTargets ? `${completed.length}/${props.issues.length}` : '未装配'}</span>
      </div>
      <div className="revision-target-metrics">
        <article>
          <span>已完成</span>
          <strong>{completed.length}</strong>
        </article>
        <article className={pending.length > 0 ? 'danger' : ''}>
          <span>未完成</span>
          <strong>{pending.length}</strong>
        </article>
      </div>
      {pending.length > 0 ? (
        <ul>
          {pending.slice(0, 3).map((issue) => (
            <li key={issue.description}>{issue.description}</li>
          ))}
        </ul>
      ) : (
        <p>{hasRevisionTargets ? '候选稿已覆盖当前回修清单中的目标。' : '当前候选稿审查中还没有回修目标记录。'}</p>
      )}
      <div className="revision-target-actions">
        <button
          type="button"
          className="primary-button"
          disabled={props.generationRunning}
          onClick={regenerateForRevisionTargets}
        >
          {props.generationRunning ? '生成中' : '按回修目标再次生成'}
        </button>
        <button type="button" className="ghost-button" onClick={() => props.onRevealProjectPath(props.revisionPath)}>
          定位回修清单
        </button>
        <button type="button" className="ghost-button" onClick={() => props.onRevealProjectPath(props.candidatePath)}>
          定位候选稿
        </button>
      </div>
    </section>
  )
}

export function ManuscriptPanel(props: WorkspaceProps) {
  const [readingMode, setReadingMode] = useState(false)
  const [editorFontSize, setEditorFontSize] = useState(() => {
    const saved = window.localStorage.getItem('olienta:manuscript-font-size')
    const parsed = saved ? Number(saved) : 17
    return Number.isFinite(parsed) ? Math.max(14, Math.min(24, parsed)) : 17
  })
  const paragraphCount = countParagraphs(props.manuscript)
  const draftItems = buildChapterDraftItems(props)
  const selectedChapterIndex = props.chapters.findIndex((chapter) => chapter.id === props.selectedChapterId)
  const previousChapter = selectedChapterIndex > 0 ? props.chapters[selectedChapterIndex - 1] : null
  const nextChapter = selectedChapterIndex >= 0 && selectedChapterIndex < props.chapters.length - 1
    ? props.chapters[selectedChapterIndex + 1]
    : null

  useEffect(() => {
    window.localStorage.setItem('olienta:manuscript-font-size', String(editorFontSize))
  }, [editorFontSize])

  return (
    <section className="confirmation-grid">
      <div className="confirmation-main">
        <section className="manuscript-top-strip">
          <section className="chapter-chain">
            <div className="chapter-chain-heading">
              <div>
                <h2>本章草稿列表</h2>
                <p>保存确认后才成为正文；未确认内容只作为草稿版本保留。</p>
              </div>
              <span className={`save-state-pill ${saveStateTone(props.saveState)}`}>{props.saveState}</span>
            </div>
            <div className="chapter-draft-list">
              {draftItems.map((item) => (
                <button
                  type="button"
                  className={`chapter-draft-link ${item.kind}`}
                  key={item.key}
                  onClick={item.onClick}
                >
                  <strong>{item.title}</strong>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="review-card manuscript-status-card">
            <div className="panel-heading">
              <h2>章节状态</h2>
              <span>{formatChapterState(props.currentChapter.state)}</span>
            </div>
            <div className="health-strip compact">
              <article><span>字数</span><strong>{props.manuscriptWordCount}</strong></article>
              <article><span>文本单位</span><strong>{estimateTextUnits(props.manuscript)}</strong></article>
              <article><span>段落</span><strong>{paragraphCount}</strong></article>
            </div>
          </section>

          <section className="review-card author-confirm-card">
            <div className="panel-heading">
              <h2>作者确认</h2>
            </div>
            <p className="empty-note">确认后，本章当前内容会成为正式正文。</p>
            <div className="editor-actions">
              <button type="button" className="primary-button" onClick={props.onSaveChapter}>保存确认正文</button>
            </div>
          </section>

          <section className="review-card manuscript-export-card">
            <div className="panel-heading">
              <h2>导出当前章</h2>
              <span>{props.lastExportedPath || '尚未导出'}</span>
            </div>
            <div className="editor-actions">
              <button type="button" className="ghost-button" onClick={() => props.onExportProject('markdown', 'chapter')}>MD</button>
              <button type="button" className="ghost-button" onClick={() => props.onExportProject('docx', 'chapter')}>DOCX</button>
            </div>
          </section>
        </section>

        <MarkdownDocument
          title="正文"
          path={props.chapterPath}
          value={props.manuscript}
          onChange={props.onChangeManuscript}
          onSave={props.onSaveChapter}
          onSelectionChange={props.onChangeManuscriptSelection}
          restoreSelection={props.manuscriptRestoreSelection}
          readOnly={props.isProjectReadOnly}
          viewMode={readingMode ? 'read' : 'edit'}
          fontSize={editorFontSize}
          leadingActions={
            <>
              <button
                type="button"
                className="ghost-button compact-button"
                disabled={!previousChapter}
                onClick={() => previousChapter && props.onSelectChapter(previousChapter.id)}
              >
                上一章
              </button>
              <button
                type="button"
                className="ghost-button compact-button"
                disabled={!nextChapter}
                onClick={() => nextChapter && props.onSelectChapter(nextChapter.id)}
              >
                下一章
              </button>
              <button type="button" className="ghost-button" onClick={() => setReadingMode((value) => !value)}>
                {readingMode ? '编辑模式' : '阅读模式'}
              </button>
              <label className="inline-control font-size-control">
                <span>字号</span>
                <input
                  type="range"
                  min="14"
                  max="24"
                  value={editorFontSize}
                  onChange={(event) => setEditorFontSize(Number(event.currentTarget.value))}
                />
                <strong>{editorFontSize}px</strong>
              </label>
            </>
          }
          actions={
            <>
              <button type="button" className="ghost-button" onClick={props.onToggleFocusMode}>专注模式</button>
              {!props.isProjectReadOnly && <button type="button" className="ghost-button" onClick={props.onImportChapterMarkdown}>导入 MD</button>}
              {!props.isProjectReadOnly && <button type="button" className="ghost-button" onClick={props.onGenerateBlueprintFromManuscript}>由正文生成蓝图</button>}
            </>
          }
        />
      </div>
    </section>
  )
}

export function MarkdownDocument(props: {
  title: string
  path: string
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onSelectionChange?: (start: number, end: number) => void
  restoreSelection?: { start: number; end: number } | null
  readOnly?: boolean
  viewMode?: 'edit' | 'read'
  fontSize?: number
  hideReadOnlyBadge?: boolean
  hideSaveButton?: boolean
  hidePath?: boolean
  leadingActions?: ReactNode
  actions?: ReactNode
}) {
  const editorRef = useRef<MarkdownEditorKernelHandle | null>(null)
  const stats = getMarkdownStats(props.value)
  const renderedMode = props.readOnly || props.viewMode === 'read'
  const isManuscriptDocument = props.path.startsWith('manuscript/chapters/')
  const editorStyle = { '--editor-font-size': `${props.fontSize ?? 17}px` } as CSSProperties

  function applyAction(action: MarkdownAction) {
    editorRef.current?.applyAction(action)
  }

  return (
    <section className="editor-card module-document-panel">
      <div className="card-heading">
        <div><h2>{props.title}</h2>{!props.hidePath && <p>{props.path}</p>}</div>
        <div className="editor-actions">
          {props.readOnly && !props.hideReadOnlyBadge && <span className="status-pill">只读</span>}
          {props.leadingActions}
          {props.actions}
          {!props.readOnly && !props.hideSaveButton && <button className="primary-button" onClick={props.onSave}>保存</button>}
        </div>
      </div>
      {!renderedMode && (
        <div className="markdown-editor-shell" style={editorStyle}>
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
          <MarkdownEditorKernel
            ref={editorRef}
            className="markdown-preview source"
            ariaLabel={`${props.title} Markdown 编辑器`}
            value={props.value}
            onChange={props.onChange}
            onSelectionChange={props.onSelectionChange}
            restoreSelection={props.restoreSelection}
            cleanPaste={(html, text) => html ? htmlToMarkdown(html) : cleanPastedText(text)}
          />
          <div className="markdown-editor-meta">
            <span>{stats.lines} 行</span>
            <span>{stats.paragraphs} 段</span>
            <span>{stats.units} 字/词</span>
          </div>
        </div>
      )}
      {renderedMode && (
        <div
          className={`markdown-rendered local-markdown-rendered ${isManuscriptDocument ? 'manuscript-rendered' : ''}`}
          style={editorStyle}
        >
          {renderMarkdownPreview(props.value)}
        </div>
      )}
    </section>
  )
}

function buildChapterDraftItems(props: WorkspaceProps) {
  const baseTitle = formatChapterDisplayTitle(props.selectedChapterId, props.currentChapter.title)
  const items: Array<{
    key: string
    title: string
    label: string
    kind: 'confirmed' | 'draft'
    onClick: () => void
  }> = [
    {
      key: 'confirmed-manuscript',
      title: baseTitle,
      label: '正文',
      kind: 'confirmed',
      onClick: () => undefined,
    },
  ]

  const historyItems = props.candidateHistory.slice().reverse()
  historyItems.forEach((item, index) => {
    items.push({
      key: item.relative_path,
      title: `${baseTitle}${index + 1}`,
      label: '草稿',
      kind: 'draft',
      onClick: () => {
        props.onSelectView('draft-box')
        props.onLoadCandidateHistory(item.relative_path)
      },
    })
  })

  if (props.candidate.trim()) {
    items.push({
      key: 'current-candidate',
      title: `${baseTitle}${historyItems.length + 1}`,
      label: '草稿',
      kind: 'draft',
      onClick: () => props.onSelectView('draft-box'),
    })
  }

  return items
}

function formatChapterDisplayTitle(chapterId: string, rawTitle: string) {
  const numeric = Number.parseInt(chapterId, 10)
  const chapterLabel = Number.isFinite(numeric)
    ? `第${numeric.toString().padStart(2, '0')}章`
    : `第${chapterId}章`
  const cleanedTitle = rawTitle
    .replace(/^第\s*\d+\s*章[：:\s-]*/u, '')
    .replace(/^第[零一二三四五六七八九十百千万〇两]+章[：:\s-]*/u, '')
    .trim()
  return cleanedTitle ? `${chapterLabel} ${cleanedTitle}` : chapterLabel
}

function formatChapterState(state: string | undefined) {
  const normalized = (state ?? '').trim().toLowerCase()
  const labels: Record<string, string> = {
    confirmed: '已确认',
    draft: '草稿',
    empty: '空白',
    missing: '未建立',
  }
  return labels[normalized] ?? (state || '草稿')
}

function saveStateTone(state: string) {
  if (/失败|failed|error/i.test(state)) return 'failed'
  if (/未保存|修改|unsaved|dirty/i.test(state)) return 'dirty'
  if (/正在|saving|working/i.test(state)) return 'saving'
  if (/已保存|已读取|saved|ready/i.test(state)) return 'saved'
  return 'idle'
}

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
    chars: value.length,
    bytes: new TextEncoder().encode(value).length,
  }
}

export function ChapterList(props: WorkspaceProps) {
  const [fulfillmentByChapter, setFulfillmentByChapter] = useState<Record<string, ContractFulfillmentSummary | null>>({})
  const [fulfillmentFilter, setFulfillmentFilter] = useState<'all' | 'risk' | 'missing' | 'ok'>('all')

  useEffect(() => {
    let cancelled = false

    async function loadChapterFulfillmentBadges() {
      if (!props.project) {
        setFulfillmentByChapter({})
        return
      }

      const entries = await Promise.all(
        props.chapters.map(async (chapter) => {
          try {
            const loaded = await tauriApi.loadProjectMarkdownFile(
              props.project!.root_path,
              `story-contracts/fulfillment/${chapter.id}.json`,
            )
            return [chapter.id, JSON.parse(loaded.content) as ContractFulfillmentSummary] as const
          } catch {
            return [chapter.id, null] as const
          }
        }),
      )

      if (!cancelled) {
        setFulfillmentByChapter(Object.fromEntries(entries))
      }
    }

    void loadChapterFulfillmentBadges()
    return () => {
      cancelled = true
    }
  }, [props.project, props.chapters])

  const chapterRows = props.chapters.map((chapter) => {
    const fulfillment = fulfillmentByChapter[chapter.id]
    const badge = chapterFulfillmentBadge(fulfillment)
    return { chapter, fulfillment, badge }
  })
  const visibleChapterRows = chapterRows.filter(({ chapter, fulfillment }) => {
    if (chapter.id === props.selectedChapterId) return true
    return chapterMatchesFulfillmentFilter(fulfillmentFilter, fulfillment)
  })

  return (
    <aside className="chapter-list-panel">
      <div className="chapter-contract-filter">
        {[
          ['all', '全部'],
          ['risk', '有风险'],
          ['missing', '未生成'],
          ['ok', '已通过'],
        ].map(([key, label]) => (
          <button
            type="button"
            className={fulfillmentFilter === key ? 'active' : ''}
            key={key}
            onClick={() => setFulfillmentFilter(key as typeof fulfillmentFilter)}
          >
            {label}
          </button>
        ))}
        <small>{visibleChapterRows.length} / {props.chapters.length}</small>
      </div>
      {visibleChapterRows.map(({ chapter, badge }) => (
        <button
          className={`chapter-list-item ${chapter.id === props.selectedChapterId ? 'active' : ''}`}
          key={chapter.id}
          onClick={() => props.onSelectChapter(chapter.id)}
        >
          <span>{chapter.id}</span>
          <strong>{chapter.title}</strong>
          <small>{chapter.words} 字</small>
          <em className={`chapter-contract-badge ${badge.tone}`} title={badge.title}>{badge.label}</em>
        </button>
      ))}
    </aside>
  )
}

function chapterMatchesFulfillmentFilter(
  filter: 'all' | 'risk' | 'missing' | 'ok',
  summary: ContractFulfillmentSummary | null | undefined,
) {
  if (filter === 'all') return true
  if (filter === 'missing') return summary === undefined || summary === null
  if (!summary) return false
  const hasRisk = summary.touchedForbiddenCount > 0 || summary.missingRequiredCount > 0
  if (filter === 'risk') return hasRisk
  if (filter === 'ok') return !hasRisk
  return true
}

function chapterFulfillmentBadge(summary: ContractFulfillmentSummary | null | undefined) {
  if (summary === undefined || summary === null) {
    return { tone: 'empty', label: '未生成', title: '保存正文后生成合同履约摘要。' }
  }
  if (summary.touchedForbiddenCount > 0) {
    return { tone: 'danger', label: '禁写风险', title: `触碰禁写项 ${summary.touchedForbiddenCount} 条` }
  }
  if (summary.missingRequiredCount > 0) {
    return { tone: 'warning', label: '缺必须项', title: `缺失必须项 ${summary.missingRequiredCount} 条` }
  }
  return { tone: 'ok', label: '已通过', title: `履约得分 ${summary.score}` }
}

export function FocusMode(props: WorkspaceProps) {
  const stats = getMarkdownStats(props.manuscript)
  const hasCandidateDraft = props.candidate.trim().length > 0
  const selectedChapterIndex = props.chapters.findIndex((chapter) => chapter.id === props.selectedChapterId)
  const previousChapter = selectedChapterIndex > 0 ? props.chapters[selectedChapterIndex - 1] : null
  const nextChapter = selectedChapterIndex >= 0 && selectedChapterIndex < props.chapters.length - 1
    ? props.chapters[selectedChapterIndex + 1]
    : null
  const [focusLayout, setFocusLayout] = useState({
    chapterId: props.selectedChapterId,
    splitMode: hasCandidateDraft,
  })
  const splitMode = focusLayout.chapterId === props.selectedChapterId
    ? focusLayout.splitMode
    : hasCandidateDraft

  const setCurrentSplitMode = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    setFocusLayout((current) => {
      const currentSplit = current.chapterId === props.selectedChapterId ? current.splitMode : hasCandidateDraft
      return {
        chapterId: props.selectedChapterId,
        splitMode: typeof next === 'function' ? next(currentSplit) : next,
      }
    })
  }, [hasCandidateDraft, props.selectedChapterId])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (splitMode) {
        setCurrentSplitMode(false)
        return
      }
      props.onToggleFocusMode()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [props, setCurrentSplitMode, splitMode])

  function exitFocusMode() {
    if (splitMode) {
      setCurrentSplitMode(false)
      return
    }
    props.onToggleFocusMode()
  }

  return (
    <section className={`focus-writing-mode ${splitMode ? 'split' : 'single'}`}>
      <div className="focus-writing-stage">
        <div className="focus-writing-pane manuscript-pane">
          <h1>{props.currentChapter.title}</h1>
          <MarkdownEditorKernel
            className="focus-editor"
            ariaLabel="专注模式 Markdown 编辑器"
            value={props.manuscript}
            onChange={props.onChangeManuscript}
            onSelectionChange={props.onChangeManuscriptSelection}
            restoreSelection={props.manuscriptRestoreSelection}
            cleanPaste={(html, text) => html ? htmlToMarkdown(html) : cleanPastedText(text)}
          />
        </div>
        {splitMode && (
          <aside className="focus-writing-pane candidate-pane" aria-label="候选稿参考">
            <h1>候选稿参考</h1>
            <div className="focus-candidate-preview">
              {renderMarkdownPreview(props.candidate)}
            </div>
          </aside>
        )}
      </div>
      <div className="focus-meta">
        <button
          type="button"
          disabled={!previousChapter}
          onClick={() => previousChapter && props.onSelectChapter(previousChapter.id)}
        >
          上一章
        </button>
        <button
          type="button"
          disabled={!nextChapter}
          onClick={() => nextChapter && props.onSelectChapter(nextChapter.id)}
        >
          下一章
        </button>
        {hasCandidateDraft && (
          <button type="button" onClick={() => setCurrentSplitMode((current) => !current)}>
            {splitMode ? '单屏写作' : '双屏对照'}
          </button>
        )}
        <button type="button" className="focus-exit-button" onClick={exitFocusMode}>{splitMode ? '收起对照' : '退出专注'}</button>
        <span>{stats.paragraphs} 段</span>
        <span>{stats.units} 字</span>
        <span>{stats.lines} 行</span>
      </div>
    </section>
  )
}

function groupCandidateReviewIssues(issues: CandidateReviewIssue[]): ReviewGroup[] {
  const groups = REVIEW_GROUPS.map((group) => ({ ...group, items: [] as CandidateReviewIssue[] }))

  for (const issue of issues) {
    const group = groups.find((item) => item.match(issue)) ?? groups[groups.length - 1]
    group.items.push(issue)
  }

  return groups
    .filter((group) => group.items.length > 0)
    .map(({ key, title, tone, items }) => ({ key, title, tone, items }))
}

function issueFromWarning(description: string): CandidateReviewIssue {
  return {
    severity: description.includes('禁写') || description.includes('时间线') ? 'high' : 'medium',
    category: description.includes('回修目标') ? 'revision' : description.includes('时间线') ? 'timeline' : description.includes('事实') ? 'fact' : 'other',
    location: '候选稿',
    description,
    evidence: description,
    fix_hint: '按审查提醒修改候选稿后重新保存。',
    blocking: description.includes('禁写') || description.includes('时间线'),
  }
}

function formatReviewSeverity(severity: string) {
  const labels: Record<string, string> = {
    critical: '严重',
    high: '高',
    medium: '中',
    low: '低',
  }
  return labels[severity] ?? severity
}

function formatReviewCategory(category: string) {
  const labels: Record<string, string> = {
    timeline: '时间线',
    blueprint: '蓝图',
    setting: '设定',
    fact: '事实',
    character: '角色',
    context: '上下文',
    revision: '回修',
    continuity: '连续性',
    generation: '生成',
    ai_flavor: 'AI味',
    other: '其他',
  }
  return labels[category] ?? category
}

function TimelineReviewPanel(props: {
  eventsPath: string
  milestonesPath: string
  issues: CandidateReviewIssue[]
  onRevealProjectPath: (relativePath: string) => void
}) {
  const sourceCounts = props.issues.reduce<Record<string, number>>((counts, issue) => {
    const source = issue.location.match(/([^（）()]+\.md)/)?.[1]
    if (!source) return counts
    counts[source] = (counts[source] ?? 0) + 1
    return counts
  }, {})

  return (
    <article className="timeline-review-card">
      <div className="candidate-review-group-head">
        <strong>Timeline Pro 冲突来源</strong>
        <span>{props.issues.length}</span>
      </div>
      <div className="timeline-review-source-grid">
        {[props.eventsPath, props.milestonesPath].map((path) => (
          <button
            type="button"
            className="timeline-review-source"
            key={path}
            onClick={() => props.onRevealProjectPath(path)}
          >
            <strong>{path}</strong>
            <span>{sourceCounts[path] ?? 0} 条命中</span>
          </button>
        ))}
      </div>
      <p>
        时间线 issue 已带来源文件和行号。先打开对应文件确认边界，再决定候选稿是保留、改写还是推迟到后续章节。
      </p>
    </article>
  )
}

function DiffPreviewList(props: {
  items: string[]
  emptyText: string
  onLocate?: (item: string) => void
  onInsert?: (item: string) => void
  onAppend?: (item: string) => void
}) {
  if (props.items.length === 0) {
    return <p className="empty-note">{props.emptyText}</p>
  }

  const previewItems = props.items.slice(0, 6)
  const hiddenCount = props.items.length - previewItems.length

  return (
    <>
      <ul>
        {previewItems.map((item) => (
          <li className="diff-preview-item" key={item}>
            <span>{trimDiffParagraph(item)}</span>
            {(props.onLocate || props.onInsert || props.onAppend) && (
              <span className="diff-preview-actions">
                {props.onLocate && (
                  <button type="button" className="ghost-button" onClick={() => props.onLocate?.(item)}>定位</button>
                )}
                {props.onInsert && (
                  <button type="button" className="ghost-button" onClick={() => props.onInsert?.(item)}>插入</button>
                )}
                {props.onAppend && (
                  <button type="button" className="ghost-button" onClick={() => props.onAppend?.(item)}>追加</button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && <p className="diff-more">还有 {hiddenCount} 个段落未展开。</p>}
    </>
  )
}

function trimDiffParagraph(paragraph: string) {
  const compact = paragraph.replace(/\s+/g, ' ').trim()
  if (compact.length <= 140) return compact
  return `${compact.slice(0, 140)}...`
}

function paragraphPairKey(candidate: string, manuscript: string) {
  return `${candidate}\n---\n${manuscript}`
}

function formatSelectionLabel(selection: { start: number; end: number } | null, manuscriptLength: number) {
  if (!selection) return `未记录光标，将插入正文末尾（${manuscriptLength}）`
  const start = Math.max(0, Math.min(selection.start, manuscriptLength))
  const end = Math.max(start, Math.min(selection.end, manuscriptLength))
  if (start === end) return `正文光标 ${start}`
  return `正文选区 ${start}-${end}，插入时会替换选区`
}

function formatCandidateSelectionLabel(selection: { start: number; end: number } | null, candidate: string) {
  const clamped = clampSelection(selection, candidate.length)
  if (!clamped || clamped.start === clamped.end || !candidate.slice(clamped.start, clamped.end).trim()) {
    return `整份候选稿（${candidate.length} 字符）`
  }
  return `候选稿选区 ${clamped.start}-${clamped.end}（${clamped.end - clamped.start} 字符）`
}

function clampSelection(selection: { start: number; end: number } | null, length: number) {
  if (!selection) return null
  const start = Math.max(0, Math.min(selection.start, length))
  const end = Math.max(start, Math.min(selection.end, length))
  return { start, end }
}
