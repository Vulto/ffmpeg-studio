import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes,
} from '@xyflow/react'
import { Upload } from 'lucide-react'
import { useMediaImport } from '../hooks/useMediaImport'
import { canvasThemes } from '../lib/canvasThemes'
import { useMediaStore } from '../store/mediaStore'
import { useThemeStore } from '../store/themeStore'
import { useTerminalStore } from '../store/terminalStore'
import { BottomToolbar } from './BottomToolbar'
import { EmptyCanvas } from './EmptyCanvas'
import { ImageNode } from './nodes/ImageNode'
import { VideoNode } from './nodes/VideoNode'

const nodeTypes = {
  image: ImageNode,
  video: VideoNode,
} satisfies NodeTypes

type MediaCanvasProps = {
  onImportReady: (openImport: () => void) => void
}

export function MediaCanvas({ onImportReady }: MediaCanvasProps) {
  return (
    <ReactFlowProvider>
      <MediaCanvasInner onImportReady={onImportReady} />
    </ReactFlowProvider>
  )
}

function CanvasViewHelper() {
  const focusRequest = useMediaStore((s) => s.focusRequest)
  const nodeCount = useMediaStore((s) => s.nodes.length)
  const { fitView } = useReactFlow()
  const prevNodeCount = useRef(0)

  useEffect(() => {
    if (nodeCount > 0 && prevNodeCount.current === 0) {
      const timer = setTimeout(() => {
        void fitView({ padding: 0.2, duration: 200 })
      }, 50)
      prevNodeCount.current = nodeCount
      return () => clearTimeout(timer)
    }
    prevNodeCount.current = nodeCount
  }, [nodeCount, fitView])

  useEffect(() => {
    if (focusRequest === 0) return
    const timer = setTimeout(() => {
      void fitView({ padding: 0.2, duration: 300 })
    }, 50)
    return () => clearTimeout(timer)
  }, [focusRequest, fitView])

  return null
}

function MediaCanvasInner({ onImportReady }: MediaCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const nodes = useMediaStore((s) => s.nodes)
  const activeTool = useMediaStore((s) => s.activeTool)
  const addFilesAt = useMediaStore((s) => s.addFilesAt)
  const removeNode = useMediaStore((s) => s.removeNode)
  const onNodesChange = useMediaStore((s) => s.onNodesChange)
  const getReferenceIndex = useMediaStore((s) => s.getReferenceIndex)
  const toggleReference = useTerminalStore((s) => s.toggleReference)
  const theme = useThemeStore((s) => s.theme)
  const canvasTheme = canvasThemes[theme]
  const { screenToFlowPosition } = useReactFlow()
  const [isDragging, setIsDragging] = useState(false)

  const getCenterPosition = useCallback(() => {
    const bounds = reactFlowWrapper.current?.getBoundingClientRect()
    if (!bounds) return { x: 0, y: 0 }
    return screenToFlowPosition({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    })
  }, [screenToFlowPosition])

  const handleImport = useCallback(
    (files: FileList | File[], position: { x: number; y: number }) => {
      void addFilesAt(files, position)
    },
    [addFilesAt],
  )

  const { openFilePicker, fileInput } = useMediaImport({
    onImport: handleImport,
    getCenterPosition,
  })

  useEffect(() => {
    onImportReady(openFilePicker)
  }, [onImportReady, openFilePicker])

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = applyNodeChanges(changes, nodes)
      onNodesChange(next as typeof nodes)
    },
    [nodes, onNodesChange],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return

      const selected = nodes.filter((n) => n.selected)
      if (selected.length === 0) return

      event.preventDefault()
      for (const node of selected) {
        removeNode(node.id)
      }
    },
    [nodes, removeNode],
  )

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setIsDragging(false)

      const files = event.dataTransfer.files
      if (!files || files.length === 0) return

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      void addFilesAt(files, position)
    },
    [addFilesAt, screenToFlowPosition],
  )

  const defaultViewport = useMemo(() => ({ x: 0, y: 0, zoom: 1 }), [])

  const handleNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      if (activeTool !== 'select') return
      if (event.shiftKey || event.metaKey || event.ctrlKey) return

      const index = getReferenceIndex(node.id)
      if (index === null) return

      toggleReference(index)
    },
    [activeTool, getReferenceIndex, toggleReference],
  )

  return (
    <div
      ref={reactFlowWrapper}
      className="relative h-full w-full outline-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {fileInput}

      <div className="absolute left-0 right-0 top-0 z-20 flex h-12 items-center justify-between border-b border-border-l1 bg-surface-base/80 px-4 backdrop-blur-sm">
        <span className="text-sm font-medium text-fg-primary">Canvas</span>
        <button
          type="button"
          onClick={openFilePicker}
          className="flex items-center gap-2 rounded-xl border border-border-l1 px-3 py-1.5 text-xs text-fg-primary transition-colors hover:bg-button-ghost-hover"
        >
          <Upload className="size-3.5" />
          Import
        </button>
      </div>

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-30 border-2 border-dashed border-white/20 bg-white/5" />
      )}

      {nodes.length === 0 && <EmptyCanvas onImport={openFilePicker} />}

      <BottomToolbar />

      <ReactFlow
        className={`${canvasTheme.flowClass} !absolute inset-0`}
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        defaultViewport={defaultViewport}
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={null}
        panOnDrag={activeTool === 'pan'}
        selectionOnDrag={activeTool === 'select'}
        nodesDraggable={activeTool === 'select'}
        elementsSelectable={activeTool === 'select'}
        proOptions={{ hideAttribution: true }}
      >
        <CanvasViewHelper />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={canvasTheme.dotColor}
        />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          position="bottom-right"
          bgColor={canvasTheme.minimap.bg}
          maskColor={canvasTheme.minimap.mask}
          nodeColor={canvasTheme.minimap.node}
          className="!rounded-xl !border !border-border-l1"
        />
      </ReactFlow>
    </div>
  )
}