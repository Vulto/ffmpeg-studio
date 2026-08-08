import { create } from 'zustand'
import type { Node } from '@xyflow/react'
import { fetchWorkspaceMediaInfo, uploadFile, type OutputFileInfo } from '../lib/api'
import {
  getInputEntries,
  getNodePath,
  nodeHasPath,
  type InputEntry,
} from '../lib/presets'
import {
  filterAcceptedFiles,
  getDisplaySize,
  getFileMediaKind,
  getOversizedMediaMessage,
  isWithinUploadLimit,
  MAX_UPLOAD_LABEL,
  probeImage,
  probeVideo,
  type MediaKind,
} from '../lib/media'

export type MediaSource = 'upload' | 'output'

export type NodeOperation = {
  kind: 'upload' | 'job'
  label: string
  /** 0–100 when known; null = indeterminate */
  progress: number | null
}

export type MediaNodeData = {
  kind: MediaKind
  source: MediaSource
  fileName: string
  mimeType: string
  blobUrl: string
  naturalWidth: number
  naturalHeight: number
  displayWidth: number
  displayHeight: number
  duration?: number
  frameRate?: number
  serverId?: string
  serverPath?: string
  relativePath?: string
  isUploading: boolean
  uploadError?: string
  operation?: NodeOperation
}

export type MediaFlowNode = Node<MediaNodeData, MediaKind>

type PanelState = {
  terminalOpen: boolean
  toggleTerminal: () => void
  setTerminalOpen: (open: boolean) => void
}

type CanvasState = {
  nodes: MediaFlowNode[]
  focusRequest: number
  /** User-facing notice for rejected imports (e.g. oversize). */
  importNotice: string | null
  setImportNotice: (notice: string | null) => void
  addFilesAt: (files: FileList | File[], position: { x: number; y: number }) => Promise<void>
  addOutputPreviews: (outputs: OutputFileInfo[]) => Promise<void>
  removeNode: (id: string) => void
  onNodesChange: (nodes: MediaFlowNode[]) => void
  updateNodeData: (id: string, patch: Partial<MediaNodeData>) => void
  setNodeOperation: (id: string, operation: NodeOperation | null) => void
  setNodesOperation: (ids: string[], operation: NodeOperation | null) => void
  clearAllOperations: () => void
  selectNode: (nodeId: string, additive?: boolean) => void
  getInputPathsOrdered: () => InputEntry[]
  getReferenceIndex: (nodeId: string) => number | null
  getSelectedInputPaths: () => string[]
  findNodeIdsByPaths: (paths: string[]) => string[]
}

const OUTPUT_GAP = 48

function getAnchorPosition(nodes: MediaFlowNode[]): { x: number; y: number } {
  const selected = nodes.filter((n) => n.selected)
  const anchor = selected.length > 0 ? selected : nodes

  if (anchor.length === 0) {
    return { x: 120, y: 120 }
  }

  const maxRight = Math.max(
    ...anchor.map((n) => n.position.x + (n.data.displayWidth || 320)),
  )
  const avgY =
    anchor.reduce((sum, n) => sum + n.position.y, 0) / anchor.length

  return { x: maxRight + OUTPUT_GAP, y: avgY }
}

export const usePanelStore = create<PanelState>((set) => ({
  terminalOpen: false,
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
  setTerminalOpen: (open) => set({ terminalOpen: open }),
}))

export const useMediaStore = create<CanvasState>((set, get) => ({
  nodes: [],
  focusRequest: 0,
  importNotice: null,

  setImportNotice: (notice) => set({ importNotice: notice }),

  selectNode: (nodeId, additive = false) => {
    set({
      nodes: get().nodes.map((n) => ({
        ...n,
        selected: additive
          ? n.id === nodeId
            ? true
            : n.selected
          : n.id === nodeId,
      })),
    })
  },

  getInputPathsOrdered: () => getInputEntries(get().nodes),

  getReferenceIndex: (nodeId) => {
    const entry = getInputEntries(get().nodes).find((e) => e.nodeId === nodeId)
    return entry?.index ?? null
  },

  addFilesAt: async (files, position) => {
    const accepted = filterAcceptedFiles(files)
    if (accepted.length === 0) return

    const oversized = accepted.filter((f) => !isWithinUploadLimit(f))
    const withinLimit = accepted.filter((f) => isWithinUploadLimit(f))

    if (oversized.length > 0) {
      const details = oversized.map(getOversizedMediaMessage).join('; ')
      set({
        importNotice:
          oversized.length === 1
            ? `File too large — max ${MAX_UPLOAD_LABEL}. ${details}. Choose a smaller video or compress it first.`
            : `Files too large — max ${MAX_UPLOAD_LABEL} each. Skipped: ${details}.`,
      })
    } else {
      set({ importNotice: null })
    }

    if (withinLimit.length === 0) return

    // Keep file↔node pairs so probe skips never mis-align uploads.
    const pending: Array<{ file: File; node: MediaFlowNode }> = []

    for (let i = 0; i < withinLimit.length; i++) {
      const file = withinLimit[i]!
      const kind = getFileMediaKind(file)
      if (!kind) continue

      const blobUrl = URL.createObjectURL(file)
      let naturalWidth = 320
      let naturalHeight = 240
      let duration: number | undefined

      try {
        if (kind === 'image') {
          const dims = await probeImage(file)
          naturalWidth = dims.naturalWidth
          naturalHeight = dims.naturalHeight
        } else {
          const dims = await probeVideo(file)
          naturalWidth = dims.naturalWidth
          naturalHeight = dims.naturalHeight
          duration = dims.duration
        }
      } catch {
        URL.revokeObjectURL(blobUrl)
        continue
      }

      const display = getDisplaySize(naturalWidth, naturalHeight)
      const id = crypto.randomUUID()
      const mimeType =
        file.type ||
        (kind === 'video' ? 'video/mp4' : 'image/png')

      pending.push({
        file,
        node: {
          id,
          type: kind,
          position: {
            x: position.x + pending.length * 40,
            y: position.y + pending.length * 40,
          },
          data: {
            kind,
            source: 'upload',
            fileName: file.name,
            mimeType,
            blobUrl,
            naturalWidth,
            naturalHeight,
            displayWidth: display.width,
            displayHeight: display.height,
            duration,
            isUploading: true,
            operation: {
              kind: 'upload',
              label: 'Uploading',
              progress: 0,
            },
          },
        },
      })
    }

    if (pending.length === 0) return

    set({ nodes: [...get().nodes, ...pending.map((p) => p.node)] })

    for (const { file, node } of pending) {
      try {
        const uploaded = await uploadFile(file, (ratio) => {
          get().setNodeOperation(node.id, {
            kind: 'upload',
            label: 'Uploading',
            progress: Math.round(ratio * 100),
          })
        })
        get().updateNodeData(node.id, {
          serverId: uploaded.id,
          serverPath: uploaded.path,
          isUploading: false,
          uploadError: undefined,
          operation: undefined,
          ...(uploaded.duration !== undefined && Number.isFinite(uploaded.duration)
            ? { duration: uploaded.duration }
            : {}),
          ...(uploaded.frameRate !== undefined && Number.isFinite(uploaded.frameRate)
            ? { frameRate: uploaded.frameRate }
            : {}),
        })
      } catch (err) {
        get().updateNodeData(node.id, {
          isUploading: false,
          uploadError: err instanceof Error ? err.message : 'Upload failed',
          operation: undefined,
        })
      }
    }
  },

  addOutputPreviews: async (outputs) => {
    if (outputs.length === 0) return

    const anchor = getAnchorPosition(get().nodes)
    const newNodes: MediaFlowNode[] = []

    for (let i = 0; i < outputs.length; i++) {
      const output = outputs[i]

      try {
        const info = await fetchWorkspaceMediaInfo(output.relativePath)
        const display = getDisplaySize(info.naturalWidth, info.naturalHeight)
        const mediaUrl = `${info.url}&t=${Date.now()}`

        newNodes.push({
          id: crypto.randomUUID(),
          type: info.kind,
          position: {
            x: anchor.x,
            y: anchor.y + i * 40,
          },
          selected: i === outputs.length - 1,
          data: {
            kind: info.kind,
            source: 'output',
            fileName: info.fileName,
            mimeType: info.mimeType,
            blobUrl: mediaUrl,
            naturalWidth: info.naturalWidth,
            naturalHeight: info.naturalHeight,
            displayWidth: display.width,
            displayHeight: display.height,
            duration: info.duration,
            frameRate: info.frameRate,
            relativePath: output.relativePath,
            isUploading: false,
          },
        })
      } catch {
        // skip outputs we cannot preview
      }
    }

    if (newNodes.length === 0) return

    const replacedPaths = new Set(outputs.map((o) => o.relativePath))
    const kept = get().nodes.filter(
      (n) =>
        !(
          n.data.source === 'output' &&
          n.data.relativePath &&
          replacedPaths.has(n.data.relativePath)
        ),
    )

    set({
      nodes: [...kept.map((n) => ({ ...n, selected: false })), ...newNodes],
      focusRequest: get().focusRequest + 1,
    })
  },

  removeNode: (id) => {
    const node = get().nodes.find((n) => n.id === id)
    if (node?.data.source === 'upload' && node.data.blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(node.data.blobUrl)
    }
    set({ nodes: get().nodes.filter((n) => n.id !== id) })
  },

  onNodesChange: (nodes) => set({ nodes }),

  updateNodeData: (id, patch) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
      ),
    })
  },

  setNodeOperation: (id, operation) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id !== id) return node
        const data = { ...node.data }
        if (operation === null) {
          delete data.operation
        } else {
          data.operation = operation
        }
        return { ...node, data }
      }),
    })
  },

  setNodesOperation: (ids, operation) => {
    const idSet = new Set(ids)
    set({
      nodes: get().nodes.map((node) => {
        if (!idSet.has(node.id)) return node
        const data = { ...node.data }
        if (operation === null) {
          delete data.operation
        } else {
          data.operation = operation
        }
        return { ...node, data }
      }),
    })
  },

  clearAllOperations: () => {
    set({
      nodes: get().nodes.map((node) => {
        if (!node.data.operation) return node
        const data = { ...node.data }
        delete data.operation
        return { ...node, data }
      }),
    })
  },

  getSelectedInputPaths: () => {
    return getInputEntries(get().nodes).map((e) => e.path)
  },

  findNodeIdsByPaths: (paths) => {
    const pathSet = new Set(paths)
    return get()
      .nodes.filter((n) => {
        if (!nodeHasPath(n)) return false
        return pathSet.has(getNodePath(n))
      })
      .map((n) => n.id)
  },
}))

export { nodeHasPath, getNodePath }