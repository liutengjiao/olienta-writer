import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const appDir = resolve(import.meta.dirname, '..')
const checks = []

async function read(relativePath) {
  return readFile(resolve(appDir, relativePath), 'utf8')
}

function check(label, condition, detail = '') {
  checks.push({ label, ok: Boolean(condition), detail })
  if (condition) {
    console.log(`PASS ${label}${detail ? ` - ${detail}` : ''}`)
  } else {
    console.error(`FAIL ${label}${detail ? ` - ${detail}` : ''}`)
  }
}

const appSource = await read('src/App.tsx')
const workspaceTypes = await read('src/components/workspace/types.ts')
const documentPanels = await read('src/components/workspace/DocumentPanels.tsx')
const projectModel = [
  await read('src-tauri/src/project_model.rs'),
  await read('src-tauri/src/project_candidate_review.rs'),
  await read('src-tauri/src/project_candidates.rs'),
].join('\n')

check(
  'confirmation audit jumps to candidate history handler',
  appSource.includes('async function openCandidateHistoryVersion(')
    && appSource.includes('manifestPath: string')
    && appSource.includes("setActiveModule('project-structure')")
    && appSource.includes("setActiveView('draft-box')"),
)

check(
  'candidate history manifest path converts to markdown history path',
  appSource.includes('manuscript/candidates/history/${chapterId}/${match[2]}.md')
    && appSource.includes('loadCandidateHistoryPreview(historyPath, true)'),
)

check(
  'cross chapter candidate history jump refreshes selected chapter',
  appSource.includes('chapterId !== selectedChapterId')
    && appSource.includes('await selectChapterAndRefresh(chapterId)'),
)

check(
  'workspace exposes candidate history jump callback',
  workspaceTypes.includes('onOpenCandidateHistoryVersion: (manifestPath: string, confirmationPath?: string, confirmationEntryId?: string) => void')
    && appSource.includes('onOpenCandidateHistoryVersion={(manifestPath, confirmationPath, confirmationEntryId) => void openCandidateHistoryVersion(manifestPath, confirmationPath, confirmationEntryId)}'),
)

check(
  'confirmation audit card uses candidate history jump callback',
  documentPanels.includes('props.onOpenCandidateHistoryVersion(record.candidate_history_manifest_path!, record.confirmation_path, record.entry_id)')
    && documentPanels.includes('candidate_history_manifest_path'),
)

check(
  'candidate history restore writes audit trail',
  appSource.includes('recordCandidateHistoryRestore')
    && appSource.includes('candidateRestoreSource')
    && projectModel.includes('record_candidate_history_restore')
    && projectModel.includes('candidate_history_restored')
    && projectModel.includes('candidate_history_restore_previewed')
    && projectModel.includes('savedToCandidateFile'),
)

check(
  'restored candidate source persists when candidate is saved',
  appSource.includes('candidateRestoreSource?.historyPath')
    && appSource.includes('setCandidateRestoreSource(restoreSource)')
    && projectModel.includes('save_candidate_with_restore_source')
    && projectModel.includes('restored_from_history_path')
    && projectModel.includes('restored_from_confirmation_entry_id')
    && projectModel.includes('restored_at_ms'),
)

check(
  'confirmation audit highlights by entry id before path fallback',
  documentPanels.includes('activeHighlightedConfirmationEntryId')
    && documentPanels.includes('record.entry_id === activeHighlightedConfirmationEntryId')
    && documentPanels.includes('activeHighlightedConfirmationPath === record.path'),
)

check(
  'confirmation audit filters bound and unbound history records',
  documentPanels.includes('historyBindingFilter')
    && documentPanels.includes("historyBindingFilter === 'bound'")
    && documentPanels.includes("historyBindingFilter === 'unbound'")
    && documentPanels.includes('candidate_history_manifest_path'),
)

check(
  'backend writes stable confirmation entry id and history binding',
  projectModel.includes('confirmation_entry_id')
    && projectModel.includes('entry_id: Some(entry_id.to_owned())')
    && projectModel.includes('backfill_candidate_confirmation_history_manifest'),
)

const failed = checks.filter((item) => !item.ok)
if (failed.length > 0) {
  console.error(`Audit flow smoke failed: ${failed.length}/${checks.length} checks failed.`)
  process.exit(1)
}

console.log(`Audit flow smoke passed: ${checks.length} checks.`)
