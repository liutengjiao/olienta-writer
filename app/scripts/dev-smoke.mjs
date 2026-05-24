const baseUrl = new URL(process.argv[2] ?? process.env.OLIENTA_SMOKE_URL ?? 'http://localhost:1420')

const checks = []
const sourceContracts = [
  {
    path: '/src/App.tsx',
    includes: [
      '请选择或填写一个软件目录外的作品文件夹',
      'setActiveView("novel-settings")',
      '等待项目',
      'adoptCandidateIntoManuscript',
      'cancelCandidateGeneration',
      'candidateGenerationRequestRef',
      'cancelAiRequest',
      'undoParagraphReplacement',
      'openKnowledgeHit',
      'undo-replace-paragraph',
      'logs-confirmations',
      'highlightedConfirmationPath',
      'highlightedConfirmationEntryId',
      'openConfirmationRecord',
      'openCandidateHistoryVersion',
      'recordCandidateHistoryRestore',
      'candidateRestoreSource',
      'setCandidateRestoreSource',
      'candidateHistoryJumpSource',
      'setCandidateHistoryJumpSource',
      'setHighlightedConfirmationPath',
      'setHighlightedConfirmationEntryId',
      '正文已经继续修改，为避免覆盖手工编辑',
    ],
  },
  {
    path: '/src/components/ProjectPanel.tsx',
    includes: ['panel.projectStructure', 'nav.knowledge', 'panel.chapterBlueprint', 'panel.openProjectChapters'],
  },
  {
    path: '/src/components/Workspace.tsx',
    includes: ['workspace.localFirstSubtitle', 'Olienta workspace'],
  },
  {
    path: '/src/components/workspace/CorePanels.tsx',
    includes: [
      '创建项目',
      '小说结构',
      '章节蓝图',
      '作者输入',
      '蓝图历史',
      'onRegenerateFollowingBlueprints',
      '生成草案',
      'onSaveFrameworkFile',
      'onSaveTimelineEvents',
    ],
  },
  {
    path: '/src/components/workspace/EditorPanels.tsx',
    includes: [
      '候选稿与正文对比',
      '候选稿新增段落',
      '正文独有段落',
      '逐字差异预览',
      '插入光标',
      '取消生成',
      '相似段落逐字对比',
      '确认替换',
      '撤销替换',
      '打开来源并定位',
      '未命中事实、伏笔或禁写规则',
      'onChangeManuscriptSelection',
      'compareParagraphs',
      'compareInlineDiff',
      'compareSimilarParagraphs',
      'findKnowledgeHitsForParagraph',
      'candidateReviewIssues',
      'groupCandidateReviewIssues',
      'RevisionTargetStatusCard',
      '本轮回修目标',
      'onGenerateCandidate',
      'generationRunning',
      '定位回修清单',
      '定位候选稿',
      '未装配',
      'revision',
      'formatReviewSeverity',
      'DiffPreviewList',
      'MarkdownEditorKernel',
      'htmlToMarkdown',
      'renderMarkdownPreview',
      'readOnly',
      '只读',
      'chapterFulfillmentBadge',
      'chapterMatchesFulfillmentFilter',
      'chapter-contract-filter',
      'chapter-contract-badge',
      '有风险',
      '全部',
      '未生成',
      '禁写风险',
      '缺必须项',
      '已通过',
    ],
  },
  {
    path: '/src/components/workspace/MarkdownEditorKernel.tsx',
    includes: [
      'EditorView',
      '@codemirror_lang-markdown',
      'MarkdownEditorKernel',
      'applyMarkdownAction',
      'replaceSelection',
      'cleanPaste',
      'Mod-b',
      'EditorSelection.range',
    ],
  },
  {
    path: '/src/components/workspace/DocumentPanels.tsx',
    includes: ['本章写作要求', 'writingBriefPath', 'onSaveModuleMarkdownFile', '取消生成', '合同履约摘要', '合同履约总览', 'ContractFulfillmentOverview', 'ContractFulfillmentList', 'contract-fulfillment-risk-item', 'contractFulfillmentSummary', 'contractFulfillmentJsonPath', 'revisionPath', '履约得分', '缺失必须项', '触碰禁写项', '定位合同', '定位正文', '定位回修清单', 'contractFulfillmentPath', '定位摘要', 'CandidateConfirmationAuditPanel', '采用确认摘要', 'confirmation-audit-card', 'confirmation-audit-filters', 'chapterFilter', 'recordTypeFilter', 'adoptionModeFilter', 'historyBindingFilter', 'setHistoryBindingFilter', 'confirmationIndexByChapter', 'confirmationIndexFiles', 'confirmationRecords', 'includeLatestConfirmations', 'indexedConfirmationPaths', 'indexedRecords', 'fallbackRecords', 'fromIndex: true', 'entry_id', 'current_candidate_manifest_path', 'candidate_history_manifest_path', '历史归档', '已绑定历史版本', '尚未归档历史版本', '定位候选稿 manifest', '定位候选稿历史版本', 'onOpenCandidateHistoryVersion', 'activeHighlightedConfirmationPath', 'activeHighlightedConfirmationEntryId', 'activeHighlightedConfirmationLabel', 'props.highlightedConfirmationPath', 'props.highlightedConfirmationEntryId', 'onClearConfirmationHighlight', '清除确认高亮', '已高亮采用确认', 'isLatestConfirmationPath', 'confirmationTimestampFromPath', 'latestConfirmationPathFor', '显示 latest 兼容文件', 'parseConfirmationAdoptionMode', 'formatAdoptionMode', 'confirmationChapterId', 'isUndoConfirmationPath', 'formatConfirmationTitle', 'parts.at(-2)', 'Chapter ${chapterId} adoption confirmation', 'Chapter ${chapterId} undo confirmation', '上下文窗口', '最大输出', '超时秒数', 'PROVIDER_KIND_OPTIONS', 'providerModels', 'models:', '增加模型', 'Anthropic', '调用次数', '平均耗时', 'Token 总量', '预估费用', '失败诊断', '失败 Provider', '错误归因', '错误类型', '最近失败', 'Provider 诊断', '失败率', '最近结果', 'promptSummary', 'Prompt 摘要', 'retryAttempts', 'retryReason', 'attemptDurationsMs', '重试', '重试原因', '尝试耗时', 'model-call-prompt-summary', 'highlightedModelCallId', 'activeHighlightedModelCallId', 'props.highlightedModelCallId', 'model-call-row ${entry.status} ${highlighted', '已高亮模型调用记录', 'providerFilter', 'failureKindFilter', 'formatFailureKind', 'model-call-advice', 'Provider 配置', 'onOpenModelProviders', 'onClearModelCallHighlight', '只看失败', '清除筛选', 'model-call-browser', 'formatModelCallStatus', 'Provider、章节、路径或结果', '导出', '选中章节', 'exportSelected', '模型调用', 'skill-meta-row', 'formatSkillCategory', 'formatSkillTag'],
  },
  {
    path: '/src/components/workspace/KnowledgePanels.tsx',
    includes: [
      '本地全文检索',
      '角色卡',
      '角色卡索引',
      '关系图谱',
      '成长线',
      '完整度',
      'characterDocumentCompleteness',
      '已确认事实',
      'knowledgeRestoreSelection',
      'restoreSelection',
      'onSaveFrameworkFile',
      'onChangeFrameworkContent',
    ],
  },
  {
    path: '/src/lib/editorLogic.ts',
    includes: [
      'adoptCandidateIntoManuscript',
      'replaceTextRange',
      'compareSimilarParagraphs',
      'findKnowledgeHitsForParagraph',
      'findKnowledgeHitsForKind',
      'knowledgeEntries',
    ],
  },
  {
    path: '/src-tauri/src/project_model.rs',
    paths: [
      '/src-tauri/src/project_model.rs',
      '/src-tauri/src/project_candidate_review.rs',
      '/src-tauri/src/project_candidates.rs',
      '/src-tauri/src/project_ai_providers.rs',
      '/src-tauri/src/project_core.rs',
      '/src-tauri/src/project_types.rs',
    ],
    includes: [
      'undo-replace-paragraph',
      'candidate_adoption_undone',
      'candidate_adoption_undo_summary_written',
      'cancel_ai_request',
      'generate_candidate_draft_with_request_id',
      'call_openai_compatible_with_system_cancellable',
      'provider_retry_delay',
      'format_provider_retry_error',
      'write_candidate_fact_draft',
      'adopt_candidate_fact_draft',
      'candidate_fact_draft_adopted',
      'CandidateFactCandidate',
      'classify_candidate_fact',
      'StoryContractSummary',
      'ContractFulfillmentSummary',
      'CandidateHistoryManifest',
      'CandidateConfirmationIndex',
      'CandidateConfirmationIndexEntry',
      'write_candidate_history_manifest',
      'read_candidate_history_manifest',
      'save_candidate_with_restore_source',
      'record_candidate_history_restore',
      'candidate_history_restored',
      'candidate_history_restore_previewed',
      'savedToCandidateFile',
      'restored_from_history_path',
      'restored_from_confirmation_entry_id',
      'restored_at_ms',
      'backup_time_ms',
      'model_call_log_path',
      'model_call_log_entry_id',
      'adoption_status',
      'adoption_mode',
      'confirmation_path',
      'confirmation_entry_id',
      'entry_id',
      'current_candidate_manifest_path',
      'candidate_history_manifest_path',
      'backfill_candidate_confirmation_history_manifest',
      'latestConfirmationPath',
      'latestPath',
      'confirmation_file_name',
      'logs/confirmations/{id}/{confirmation_file_name}',
      'logs/confirmations/{chapter_id}/index.json',
      'undo-{timestamp}.md',
      'append_candidate_confirmation_index',
      'write_current_candidate_manifest',
      'read_current_candidate_manifest',
      'update_current_candidate_adoption_manifest',
      'write_contract_revision_checklist',
      'review_candidate_against_revision_checklist',
      'extract_revision_checklist_items',
      '回修目标完成',
      '回修目标未完成',
      'tasks/contract-revisions',
      'revisionPath',
      'revisionChecklistIncluded',
      '本轮回修目标',
      'write_chapter_story_contract',
      'contract_fulfillment_score',
      'story-contracts/chapters',
      'story-contracts/fulfillment',
      'fulfillmentJsonPath',
      'storyContractPath',
      '实体类型：',
      '识别理由：',
      '分类建议：',
      '来源定位：候选稿第',
      '章节追踪',
      '下一次出场边界',
      '候选稿承接已确认事实',
      '候选稿触碰禁写规则',
      '候选稿命中未闭合伏笔',
      'candidate-fact-drafts',
      'factDraftPath',
      '段落替换撤销确认',
      'CandidateReviewIssue',
      'review_candidate_draft_issues',
      'grouped_candidate_review_issues',
      'ANTI_AI_PATTERNS',
      'review_candidate_against_anti_ai_patterns',
      'rules/anti-ai-patterns.md',
    ],
  },
  {
    path: '/src/components/workspace/DocumentPanels.tsx',
    includes: ['runProviderTestAndRefresh', 'model-call-refresh-note', '最新记录', '测试完成，已刷新模型调用历史'],
  },
]

function ok(label, detail = '') {
  checks.push({ label, detail, ok: true })
}

function fail(label, detail = '') {
  checks.push({ label, detail, ok: false })
}

async function fetchText(url) {
  const response = await fetch(url)
  const text = await response.text()
  return { response, text }
}

function resourceUrlsFromHtml(html) {
  const urls = new Set()
  const patterns = [
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
  ]

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const value = match[1]
      if (!value || value.startsWith('http')) continue
      urls.add(new URL(value, baseUrl).toString())
    }
  }

  return Array.from(urls)
}

try {
  const { response, text: html } = await fetchText(baseUrl)
  if (response.ok) ok('html status', `${response.status} ${response.statusText}`)
  else fail('html status', `${response.status} ${response.statusText}`)

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/html')) ok('html content-type', contentType)
  else fail('html content-type', contentType || 'missing')

  if (html.trim().length > 0) ok('html body', `${html.length} bytes`)
  else fail('html body', 'empty')

  if (html.includes('id="root"')) ok('root mount', '#root found')
  else fail('root mount', '#root missing')

  if (html.includes('<html lang="zh-CN">')) ok('document language', 'zh-CN')
  else fail('document language', 'zh-CN missing')

  if (html.includes('<title>Olienta Writer</title>')) ok('document title', 'Olienta Writer')
  else fail('document title', 'unexpected or missing title')

  const resources = resourceUrlsFromHtml(html)
  if (resources.length > 0) ok('entry resources', `${resources.length} linked resource(s)`)
  else fail('entry resources', 'no script/link resources discovered')

  for (const resourceUrl of resources) {
    const resourceResponse = await fetch(resourceUrl)
    const path = new URL(resourceUrl).pathname
    if (resourceResponse.ok) ok(`resource ${path}`, `${resourceResponse.status}`)
    else fail(`resource ${path}`, `${resourceResponse.status} ${resourceResponse.statusText}`)
  }

  if (html.includes('vite-error-overlay')) fail('vite overlay marker', 'overlay marker present in HTML')
  else ok('vite overlay marker', 'not present')

  for (const contract of sourceContracts) {
    const contractPaths = contract.paths ?? [contract.path]
    const sourceParts = []
    let sourceBytes = 0
    let sourceFailed = false
    for (const path of contractPaths) {
      const sourceUrl = new URL(path, baseUrl)
      const { response: sourceResponse, text: sourcePart } = await fetchText(sourceUrl)
      if (!sourceResponse.ok) {
        fail(`source ${path}`, `${sourceResponse.status} ${sourceResponse.statusText}`)
        sourceFailed = true
        continue
      }
      sourceParts.push(sourcePart)
      sourceBytes += sourcePart.length
    }
    if (sourceFailed) continue

    const source = sourceParts.join('\n')
    ok(`source ${contract.path}`, `${sourceBytes} bytes`)
    for (const expected of contract.includes) {
      if (source.includes(expected)) ok(`copy ${contract.path}`, expected)
      else fail(`copy ${contract.path}`, `missing "${expected}"`)
    }
  }
} catch (error) {
  fail('dev server reachable', error instanceof Error ? error.message : String(error))
}

for (const check of checks) {
  const prefix = check.ok ? 'PASS' : 'FAIL'
  console.log(`${prefix} ${check.label}${check.detail ? ` - ${check.detail}` : ''}`)
}

const failed = checks.filter((check) => !check.ok)
if (failed.length > 0) {
  console.error(`Smoke check failed: ${failed.length} failed, ${checks.length} total.`)
  process.exit(1)
}

console.log(`Smoke check passed: ${checks.length} checks.`)



