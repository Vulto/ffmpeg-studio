import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { formatDuration, formatFrameRate } from '../../lib/media'
import type { MediaFlowNode } from '../../store/mediaStore'
import { MediaNodeChrome } from './MediaNodeChrome'

function VideoNodeComponent({ id, data, selected }: NodeProps<MediaFlowNode>) {
  return (
    <MediaNodeChrome
      nodeId={id}
      kind="video"
      selected={!!selected}
      width={data.displayWidth}
    >
      <video
        src={data.blobUrl}
        controls={selected}
        muted
        playsInline
        draggable={false}
        className="block w-full bg-black object-contain"
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
            <span
              className="rounded-md bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-400"
              title={data.uploadError}
            >
              upload failed
            </span>
          )}
          {data.duration !== undefined && (
            <span className="rounded-md bg-surface-inset px-1.5 py-0.5 text-[10px] text-fg-secondary">
              {formatDuration(data.duration)}
            </span>
          )}
          {data.frameRate !== undefined && data.frameRate > 0 && (
            <span
              className="rounded-md bg-surface-inset px-1.5 py-0.5 text-[10px] text-fg-secondary"
              title="Frame rate"
            >
              {formatFrameRate(data.frameRate)}
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

export const VideoNode = memo(VideoNodeComponent)