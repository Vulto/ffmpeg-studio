import type { MediaFlowNode } from '../store/mediaStore'

export type PresetId = 'upscale' | 'slideshow' | 'extract-frames'

export type PresetDef = {
  id: PresetId
  label: string
  shortLabel: string
}

export const PRESETS: PresetDef[] = [
  { id: 'upscale', label: 'Upscale image', shortLabel: 'Upscale' },
  { id: 'slideshow', label: 'Make video from images', shortLabel: 'Make video' },
  { id: 'extract-frames', label: 'Extract frames from video', shortLabel: 'Extract frames' },
]

export type InputEntry = {
  nodeId: string
  index: number
  path: string
  fileName: string
  kind: 'image' | 'video'
}

export function nodeHasPath(node: MediaFlowNode): boolean {
  return Boolean(
    !node.data.isUploading &&
      !node.data.uploadError &&
      (node.data.serverPath || node.data.relativePath),
  )
}

export function getNodePath(node: MediaFlowNode): string {
  return node.data.source === 'output'
    ? node.data.relativePath!
    : node.data.serverPath!
}

export function getInputEntries(nodes: MediaFlowNode[]): InputEntry[] {
  const hasPath = (n: MediaFlowNode) => nodeHasPath(n)
  const selected = nodes.filter((n) => n.selected && hasPath(n))
  const source =
    selected.length > 0
      ? selected
      : nodes.filter((n) => hasPath(n) && n.data.source === 'upload')

  const sorted = [...source].sort((a, b) => a.position.x - b.position.x)

  return sorted.map((node, index) => ({
    nodeId: node.id,
    index,
    path: getNodePath(node),
    fileName: node.data.fileName,
    kind: node.data.kind,
  }))
}

export function getSelectedNodes(nodes: MediaFlowNode[]): MediaFlowNode[] {
  const selected = nodes.filter((n) => n.selected && nodeHasPath(n))
  return selected.length > 0 ? selected : nodes.filter((n) => nodeHasPath(n))
}

export function canRunPreset(presetId: PresetId, nodes: MediaFlowNode[]): boolean {
  const selected = nodes.filter((n) => n.selected && nodeHasPath(n))

  if (presetId === 'upscale') {
    return selected.length === 1 && selected[0]!.data.kind === 'image'
  }

  if (presetId === 'slideshow') {
    const images = selected.filter((n) => n.data.kind === 'image')
    return images.length >= 2
  }

  if (presetId === 'extract-frames') {
    return selected.length === 1 && selected[0]!.data.kind === 'video'
  }

  return false
}

export function getPresetInputPaths(presetId: PresetId, nodes: MediaFlowNode[]): string[] {
  const selected = nodes.filter((n) => n.selected && nodeHasPath(n))

  if (presetId === 'upscale' || presetId === 'extract-frames') {
    const node = selected[0]
    return node ? [getNodePath(node)] : []
  }

  if (presetId === 'slideshow') {
    return selected
      .filter((n) => n.data.kind === 'image')
      .sort((a, b) => a.position.x - b.position.x)
      .map(getNodePath)
  }

  return []
}

export function parseReferenceTokens(command: string): number[] {
  const matches = command.matchAll(/\{\{(\d+)\}\}/g)
  return [...matches].map((m) => Number(m[1]))
}

export function toggleReferenceToken(command: string, index: number): string {
  const token = `{{${index}}}`
  if (command.includes(token)) {
    return command.replace(token, '').replace(/\s{2,}/g, ' ').trim()
  }
  const spacer = command.length > 0 && !command.endsWith(' ') ? ' ' : ''
  return `${command}${spacer}${token}`
}