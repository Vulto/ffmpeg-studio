import { useCallback, useRef } from 'react'

type UseMediaImportOptions = {
  onImport: (files: FileList | File[], position: { x: number; y: number }) => void
  getCenterPosition?: () => { x: number; y: number }
}

export function useMediaImport({
  onImport,
  getCenterPosition,
}: UseMediaImportOptions) {
  const inputRef = useRef<HTMLInputElement>(null)

  const openFilePicker = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (!files || files.length === 0) return

      const position = getCenterPosition?.() ?? { x: 0, y: 0 }
      onImport(files, position)
      event.target.value = ''
    },
    [getCenterPosition, onImport],
  )

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
      multiple
      className="hidden"
      onChange={handleFileChange}
    />
  )

  return { openFilePicker, fileInput }
}