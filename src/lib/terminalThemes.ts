import type { Theme } from '../store/themeStore'

type XTermTheme = {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
}

export const terminalThemes: Record<Theme, XTermTheme> = {
  dark: {
    background: '#111213',
    foreground: '#f8f8f8',
    cursor: '#f8f8f8',
    selectionBackground: '#3c3c3c',
    black: '#111213',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#facc15',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#f8f8f8',
    brightBlack: '#ababab',
  },
  light: {
    background: '#fafafa',
    foreground: '#171717',
    cursor: '#171717',
    selectionBackground: '#d4d4d4',
    black: '#171717',
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#ca8a04',
    blue: '#2563eb',
    magenta: '#9333ea',
    cyan: '#0891b2',
    white: '#fafafa',
    brightBlack: '#737373',
  },
}