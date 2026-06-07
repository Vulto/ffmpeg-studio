import { create } from 'zustand'

export type TerminalStatus = 'idle' | 'running' | 'error'

export type TerminalLogger = {
  writeln: (text: string) => void
  write: (text: string) => void
}

type TerminalState = {
  status: TerminalStatus
  command: string
  commandSelection: { start: number; end: number } | null
  history: string[]
  historyIndex: number
  serverOnline: boolean
  ffmpegAvailable: boolean
  ffmpegVersion: string | null
  focusInputRequest: number
  logger: TerminalLogger | null
  setLogger: (logger: TerminalLogger | null) => void
  logWriteln: (text: string) => void
  logWrite: (text: string) => void
  setStatus: (status: TerminalStatus) => void
  setCommand: (command: string) => void
  setCommandSelection: (selection: { start: number; end: number } | null) => void
  insertAtCursor: (text: string) => void
  insertReference: (index: number) => void
  toggleReference: (index: number) => void
  requestFocusInput: () => void
  setServerHealth: (online: boolean, ffmpeg?: { ok: boolean; version?: string }) => void
  pushHistory: (command: string) => void
  navigateHistory: (direction: 'up' | 'down', current: string) => string
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  status: 'idle',
  command: '',
  commandSelection: null,
  history: [],
  historyIndex: -1,
  serverOnline: false,
  ffmpegAvailable: false,
  ffmpegVersion: null,
  focusInputRequest: 0,
  logger: null,

  setLogger: (logger) => set({ logger }),

  logWriteln: (text) => get().logger?.writeln(text),

  logWrite: (text) => get().logger?.write(text),

  setStatus: (status) => set({ status }),

  setCommand: (command) => set({ command }),

  setCommandSelection: (selection) => set({ commandSelection: selection }),

  insertAtCursor: (text) => {
    const { command, commandSelection } = get()
    const start = commandSelection?.start ?? command.length
    const end = commandSelection?.end ?? command.length
    const next = command.slice(0, start) + text + command.slice(end)
    const cursor = start + text.length
    set({ command: next, commandSelection: { start: cursor, end: cursor } })
  },

  insertReference: (index) => {
    const token = `{{${index}}}`
    const { command } = get()
    if (command.includes(token)) return
    const spacer = command.length > 0 && !command.endsWith(' ') ? ' ' : ''
    get().insertAtCursor(`${spacer}${token}`)
    get().requestFocusInput()
  },

  toggleReference: (index) => {
    const token = `{{${index}}}`
    const { command } = get()
    if (command.includes(token)) {
      set({
        command: command.replace(token, '').replace(/\s{2,}/g, ' ').trim(),
      })
    } else {
      get().insertReference(index)
    }
  },

  requestFocusInput: () =>
    set({ focusInputRequest: get().focusInputRequest + 1 }),

  setServerHealth: (online, ffmpeg) =>
    set({
      serverOnline: online,
      ffmpegAvailable: ffmpeg?.ok ?? false,
      ffmpegVersion: ffmpeg?.version ?? null,
    }),

  pushHistory: (command) => {
    const trimmed = command.trim()
    if (!trimmed) return
    const history = [...get().history.filter((c) => c !== trimmed), trimmed]
    set({ history, historyIndex: history.length })
  },

  navigateHistory: (direction, current) => {
    const { history } = get()
    if (history.length === 0) return current

    let index = get().historyIndex
    if (direction === 'up') {
      index = index <= 0 ? 0 : index - 1
    } else {
      index = index >= history.length - 1 ? history.length : index + 1
    }

    set({ historyIndex: index })
    if (index >= history.length) return ''
    return history[index] ?? current
  },
}))