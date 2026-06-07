import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { MediaFlowNode } from '../../store/mediaStore'
import { MediaNodeChrome } from './MediaNodeChrome'

function ImageNodeComponent({ id, data, selected }: NodeProps<MediaFlowNode>) {
  return (
    <MediaNodeChrome
      nodeId={id}
      kind="image"
      selected={!!selected}
      width={data.displayWidth}
    >
      <img
        src={data.blobUrl}
        alt={data.fileName}
        draggable={false}
        className="block w-full object-contain"
        style={{ height: data.displayHeight }}
      />
      <div className="flex items-center justify-between gap-2 border-t border-border-l1 px-3 py-2">
        <span className="truncate text-xs text-fg-primary">{data.fileName}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {data.source === 'output' && (
            <span className="rounded-md bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-400">
              output
            </span>
          )}
          {data.isUploading && (
            <span className="rounded-md bg-surface-inset px-1.5 py-0.5 text-[10px] text-fg-secondary">
              uploading…
            </span>
          )}
          {data.uploadError && (
            <span className="rounded-md bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-400">
              upload failed
            </span>
          )}
          <span className="rounded-md bg-surface-inset px-1.5 py-0.5 text-[10px] text-fg-secondary">
            {data.naturalWidth}×{data.naturalHeight}
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <Handle type="target" position={Position.Left} className="!opacity-0" />
    </MediaNodeChrome>
  )
}

export const ImageNode = memo(ImageNodeComponent)