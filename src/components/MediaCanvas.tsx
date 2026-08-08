import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  applyNodeChanges,
  useReactFlow,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes,
} from '@xyflow/react'
import { useMediaImport } from '../hooks/useMediaImport'
import { canvasThemes } from '../lib/canvasThemes'
import { useMediaStore } from '../store/mediaStore'
import { useThemeStore } from '../store/themeStore'
import { useTerminalStore } from '../store/terminalStore'
import { BottomToolbar } from './BottomToolbar'
import {
  CanvasContextMenu,
  type ContextMenuPosition,
} from './CanvasContextMenu'
import { EmptyCanvas } from './EmptyCanvas'
import { ImportNotice } from './ImportNotice'
import { SelectionContextMenu } from './SelectionContextMenu'
import { SettingsMenu } from './SettingsMenu'
import { ImageNode } from './nodes/ImageNode'
import { VideoNode } from './nodes/VideoNode'

const nodeTypes = {
  image: ImageNode,
  video: VideoNode,
} satisfies NodeTypes

type ContextMenuState =
  | ({ type: 'canvas' } & ContextMenuPosition)
  | ({ type: 'selection' } & ContextMenuPosition)

export function MediaCanvas() {
  return (
    <ReactFlowProvider>
      <MediaCanvasInner />
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

function MediaCanvasInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const nodes = useMediaStore((s) => s.nodes)
  const addFilesAt = useMediaStore((s) => s.addFilesAt)
  const removeNode = useMediaStore((s) => s.removeNode)
  const getReferenceIndex = useMediaStore((s) => s.getReferenceIndex)
  const toggleReference = useTerminalStore((s) => s.toggleReference)
  const theme = useThemeStore((s) => s.theme)
  const canvasTheme = canvasThemes[theme]
  const { screenToFlowPosition } = useReactFlow()
  const [isDragging, setIsDragging] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

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

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    // Always read latest nodes — stale closures drop marquee/multi-select updates.
    const current = useMediaStore.getState().nodes
    const next = applyNodeChanges(changes, current)
    useMediaStore.getState().onNodesChange(next as typeof current)
  }, [])

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
      // Leave multi-select modifiers to React Flow (Control / Meta).
      // References update the command store even when the terminal panel is closed.
      if (event.shiftKey || event.metaKey || event.ctrlKey) return

      const index = getReferenceIndex(node.id)
      if (index === null) return

      toggleReference(index)
    },
    [getReferenceIndex, toggleReference],
  )

  const openSelectionMenuAt = useCallback((x: number, y: number) => {
    setContextMenu({ type: 'selection', x, y })
  }, [])

  const openCanvasContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault()
      // After marquee / multi-select, right-click empty canvas still targets the selection.
      const selectedCount = useMediaStore
        .getState()
        .nodes.filter((n) => n.selected).length
      if (selectedCount > 0) {
        openSelectionMenuAt(event.clientX, event.clientY)
        return
      }
      setContextMenu({
        type: 'canvas',
        x: event.clientX,
        y: event.clientY,
      })
    },
    [openSelectionMenuAt],
  )

  const openSelectionContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      event.preventDefault()

      const current = useMediaStore.getState().nodes
      const target = current.find((n) => n.id === node.id)
      // If right-clicked node is not selected, select only it; otherwise keep multi-selection
      // (including marquee / Control multi-select).
      if (!target?.selected) {
        useMediaStore.getState().onNodesChange(
          current.map((n) => ({
            ...n,
            selected: n.id === node.id,
          })),
        )
      }

      openSelectionMenuAt(event.clientX, event.clientY)
    },
    [openSelectionMenuAt],
  )

  /** Right-click the selection bounds after marquee multi-select. */
  const openSelectionBoxContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault()
      openSelectionMenuAt(event.clientX, event.clientY)
    },
    [openSelectionMenuAt],
  )

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

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

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-30 border-2 border-dashed border-white/20 bg-white/5" />
      )}

      {nodes.length === 0 && <EmptyCanvas onImport={openFilePicker} />}

      <ImportNotice />

      <div className="pointer-events-none absolute bottom-6 left-4 z-30">
        <div className="pointer-events-auto">
          <SettingsMenu onImport={openFilePicker} />
        </div>
      </div>

      <BottomToolbar />

      {contextMenu?.type === 'canvas' && (
        <CanvasContextMenu
          position={contextMenu}
          onImport={openFilePicker}
          onClose={closeContextMenu}
        />
      )}

      {contextMenu?.type === 'selection' && (
        <SelectionContextMenu
          position={contextMenu}
          onClose={closeContextMenu}
        />
      )}

      <ReactFlow
        className={`${canvasTheme.flowClass} !absolute inset-0`}
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onPaneContextMenu={openCanvasContextMenu}
        onNodeContextMenu={openSelectionContextMenu}
        onSelectionContextMenu={openSelectionBoxContextMenu}
        defaultViewport={defaultViewport}
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={null}
        panOnDrag={[1]}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode="Control"
        nodesDraggable
        elementsSelectable
        selectNodesOnDrag
        proOptions={{ hideAttribution: true }}
      >
        <CanvasViewHelper />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={canvasTheme.dotColor}
        />
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
