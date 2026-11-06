/**
 * CodeMirror theme for the amber terminal look (src/theme.css): amber on black,
 * keywords bright, strings and numbers in the warm highlight, comments dim.
 */
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

const BG = '#0a0602'
const PANEL = '#120b03'
const AMBER = '#ffb000'
const HI = '#ffd98a'
const MUTED = '#d4921c'
const DIM = '#a86a10'
const LINE = '#3d2808'

const view = EditorView.theme(
  {
    '&': { color: AMBER, backgroundColor: BG },
    '.cm-content': {
      caretColor: AMBER,
      fontFamily: '"IBM Plex Mono", ui-monospace, Consolas, monospace',
      textShadow: '0 0 6px rgba(255, 176, 0, 0.25)',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeft: `0.6em solid ${AMBER}`, opacity: 0.75 },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: '#4d3209' },
    '.cm-activeLine': { backgroundColor: 'rgba(255, 176, 0, 0.06)' },
    '.cm-gutters': { backgroundColor: PANEL, color: DIM, border: 'none', borderRight: `1px solid ${LINE}` },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255, 176, 0, 0.10)', color: HI },
    '.cm-matchingBracket, .cm-nonmatchingBracket': { backgroundColor: '#4d3209', outline: `1px solid ${DIM}` },
    '.cm-tooltip': { backgroundColor: PANEL, color: AMBER, border: `1px solid ${DIM}` },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: AMBER, color: BG },
    '.cm-panels': { backgroundColor: PANEL, color: AMBER },
    '.cm-searchMatch': { backgroundColor: 'rgba(255, 176, 0, 0.25)' },
  },
  { dark: true },
)

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: HI, fontWeight: '600' },
  { tag: [t.string, t.special(t.string)], color: '#f2c26b' },
  { tag: [t.number, t.bool, t.null], color: HI },
  { tag: [t.lineComment, t.blockComment, t.comment], color: DIM, fontStyle: 'italic' },
  { tag: [t.typeName, t.standard(t.name)], color: MUTED },
  { tag: [t.operator, t.punctuation, t.bracket], color: MUTED },
  { tag: [t.name, t.variableName, t.propertyName], color: AMBER },
  { tag: t.invalid, color: '#ff4b2b' },
])

export const amberTheme = [view, syntaxHighlighting(highlight)]
