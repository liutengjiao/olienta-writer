import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { basicSetup, EditorView } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState, RangeSetBuilder } from '@codemirror/state'
import { Decoration, keymap, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import type { MarkdownAction } from '../../lib/editorLogic'
import { applyMarkdownAction, replaceSelection } from '../../lib/editorLogic'

type SelectionRange = { start: number; end: number }

const markdownVisualPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = buildMarkdownDecorations(view)
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildMarkdownDecorations(update.view)
    }
  }
}, {
  decorations: (value) => value.decorations,
})

const headingLine = Decoration.line({ class: 'cm-line-heading' })
const heading2Line = Decoration.line({ class: 'cm-line-heading cm-line-heading-2' })
const heading3Line = Decoration.line({ class: 'cm-line-heading cm-line-heading-3' })
const quoteLine = Decoration.line({ class: 'cm-line-quote' })
const listLine = Decoration.line({ class: 'cm-line-list' })
const ruleLine = Decoration.line({ class: 'cm-line-rule' })
const markdownMark = Decoration.mark({ class: 'cm-md-mark' })
const inlineCodeMark = Decoration.mark({ class: 'cm-inline-code-text' })
const strongMark = Decoration.mark({ class: 'cm-strong-text' })

function buildMarkdownDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>()

  for (const { from, to } of view.visibleRanges) {
    let position = from
    while (position <= to) {
      const line = view.state.doc.lineAt(position)
      addLineDecorations(builder, line.from, line.text)
      position = line.to + 1
      if (position > view.state.doc.length) break
    }
  }

  return builder.finish()
}

function addLineDecorations(builder: RangeSetBuilder<Decoration>, from: number, text: string) {
  const heading = /^(#{1,3})\s+/.exec(text)
  if (heading) {
    const markEnd = from + heading[0].length
    const lineDecoration = heading[1].length === 1 ? headingLine : heading[1].length === 2 ? heading2Line : heading3Line
    builder.add(from, from, lineDecoration)
    builder.add(from, markEnd, markdownMark)
  }

  const quote = /^>\s?/.exec(text)
  if (quote) {
    builder.add(from, from, quoteLine)
    builder.add(from, from + quote[0].length, markdownMark)
  }

  const list = /^(\s*)[-*]\s+/.exec(text)
  if (list) {
    builder.add(from, from, listLine)
    builder.add(from + list[1].length, from + list[0].length, markdownMark)
  }

  if (/^\s*---+\s*$/.test(text)) {
    builder.add(from, from, ruleLine)
    builder.add(from, from + text.length, markdownMark)
  }

  addInlineMarks(builder, from, text, /\*\*([^*]+)\*\*/g, 2, strongMark)
  addInlineMarks(builder, from, text, /`([^`]+)`/g, 1, inlineCodeMark)
}

function addInlineMarks(
  builder: RangeSetBuilder<Decoration>,
  from: number,
  text: string,
  pattern: RegExp,
  markLength: number,
  textDecoration: Decoration,
) {
  for (const match of text.matchAll(pattern)) {
    const start = from + (match.index ?? 0)
    const end = start + match[0].length
    builder.add(start, start + markLength, markdownMark)
    builder.add(start + markLength, end - markLength, textDecoration)
    builder.add(end - markLength, end, markdownMark)
  }
}

export type MarkdownEditorKernelHandle = {
  applyAction: (action: MarkdownAction) => void
  focus: () => void
}

export const MarkdownEditorKernel = forwardRef<MarkdownEditorKernelHandle, {
  value: string
  className?: string
  ariaLabel: string
  restoreSelection?: SelectionRange | null
  onChange: (value: string) => void
  onSelectionChange?: (start: number, end: number) => void
  cleanPaste: (html: string, text: string) => string
}>(function MarkdownEditorKernel(props, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const valueRef = useRef(props.value)
  const propsRef = useRef(props)

  propsRef.current = props
  valueRef.current = props.value

  const applyKernelAction = useCallback((action: MarkdownAction) => {
    const view = viewRef.current
    if (!view) return
    const range = view.state.selection.main
    const next = applyMarkdownAction(view.state.doc.toString(), range.from, range.to, action)
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next.value },
      selection: EditorSelection.range(next.selectionStart, next.selectionEnd),
    })
    view.focus()
  }, [])

  useImperativeHandle(ref, () => ({
    applyAction: applyKernelAction,
    focus: () => viewRef.current?.focus(),
  }), [applyKernelAction])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const runAction = (action: MarkdownAction) => {
      applyKernelAction(action)
      return true
    }

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: propsRef.current.value,
        extensions: [
          basicSetup,
          markdown(),
          markdownVisualPlugin,
          keymap.of([
            { key: 'Mod-b', run: () => runAction('bold') },
            { key: 'Mod-`', run: () => runAction('inline-code') },
            { key: 'Mod-Shift-x', run: () => runAction('clean') },
            { key: 'Mod-Alt-1', run: () => runAction('h1') },
            { key: 'Mod-Alt-2', run: () => runAction('h2') },
            { key: 'Mod-Alt-q', run: () => runAction('quote') },
            { key: 'Mod-Shift-7', run: () => runAction('list') },
            { key: 'Mod--', run: () => runAction('hr') },
            { key: 'Tab', run: () => runAction('list') },
          ]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            const current = update.state.doc.toString()
            if (update.docChanged && current !== valueRef.current) {
              valueRef.current = current
              propsRef.current.onChange(current)
            }
            if (update.selectionSet || update.focusChanged) {
              const range = update.state.selection.main
              propsRef.current.onSelectionChange?.(range.from, range.to)
            }
          }),
          EditorView.domEventHandlers({
            paste(event, view) {
              const html = event.clipboardData?.getData('text/html') ?? ''
              const text = event.clipboardData?.getData('text/plain') ?? ''
              const cleaned = propsRef.current.cleanPaste(html, text)
              if (!cleaned) return false
              event.preventDefault()
              const range = view.state.selection.main
              const next = replaceSelection(view.state.doc.toString(), range.from, range.to, cleaned)
              view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: next.value },
                selection: EditorSelection.range(next.selectionStart, next.selectionEnd),
              })
              return true
            },
            click(_event, view) {
              const range = view.state.selection.main
              propsRef.current.onSelectionChange?.(range.from, range.to)
              return false
            },
            keyup(_event, view) {
              const range = view.state.selection.main
              propsRef.current.onSelectionChange?.(range.from, range.to)
              return false
            },
          }),
          EditorView.theme({
            '&': {
              minHeight: '100%',
              color: 'var(--text-strong)',
              backgroundColor: 'transparent',
            },
            '.cm-scroller': {
              fontFamily: 'var(--serif)',
              lineHeight: '1.9',
            },
            '.cm-content': {
              padding: '22px clamp(18px, 3vw, 48px)',
              caretColor: 'var(--accent)',
            },
            '.cm-gutters': {
              color: 'var(--muted)',
              backgroundColor: 'transparent',
              borderRight: '1px solid var(--border)',
            },
            '.cm-activeLine': {
              backgroundColor: 'rgba(113, 206, 255, 0.06)',
            },
            '.cm-activeLineGutter': {
              backgroundColor: 'rgba(113, 206, 255, 0.08)',
            },
            '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
              backgroundColor: 'rgba(113, 206, 255, 0.22)',
            },
            '&.cm-focused': {
              outline: '1px solid rgba(113, 206, 255, 0.34)',
            },
          }),
        ],
      }),
    })

    view.dom.setAttribute('aria-label', propsRef.current.ariaLabel)
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [applyKernelAction])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (props.value === current) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: props.value },
    })
  }, [props.value])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !props.restoreSelection) return
    const start = Math.max(0, Math.min(props.restoreSelection.start, view.state.doc.length))
    const end = Math.max(start, Math.min(props.restoreSelection.end, view.state.doc.length))
    requestAnimationFrame(() => {
      view.focus()
      view.dispatch({ selection: EditorSelection.range(start, end) })
    })
  }, [props.restoreSelection])

  return <div ref={hostRef} className={`markdown-editor-kernel ${props.className ?? ''}`} />
})
