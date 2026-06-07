import type { Theme } from '../store/themeStore'

type CanvasTheme = {
  flowClass: string
  dotColor: string
  minimap: {
    bg: string
    mask: string
    node: string
  }
}

export const canvasThemes: Record<Theme, CanvasTheme> = {
  dark: {
    flowClass: 'rf-dark',
    dotColor: '#777',
    minimap: {
      bg: '#141414',
      mask: 'rgba(60, 60, 60, 0.6)',
      node: '#2b2b2b',
    },
  },
  light: {
    flowClass: 'rf-light',
    dotColor: '#bbb',
    minimap: {
      bg: '#f5f5f5',
      mask: 'rgba(163, 163, 163, 0.6)',
      node: '#d4d4d4',
    },
  },
}