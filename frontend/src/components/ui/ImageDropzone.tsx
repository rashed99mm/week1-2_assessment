import { useEffect, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'
import { UploadIcon } from './icons'
import { cn } from '../../lib/cn'

/** Mirrors the server's `mimes:jpg,jpeg,png,webp` rule. */
const ACCEPT = 'image/jpeg,image/png,image/webp'
/** Mirrors the server's `max:4096` (kilobytes) rule. */
const MAX_BYTES = 4 * 1024 * 1024

interface ImageDropzoneProps {
  label?: string
  /** Existing cover URL from the API, if the event already has one. */
  currentUrl?: string | null
  /** The newly picked file, or null. */
  file: File | null
  /** True once the user has asked to clear an existing cover. */
  removed: boolean
  onSelect: (file: File | null) => void
  onRemove: () => void
}

export function ImageDropzone({
  label = 'Cover image',
  currentUrl,
  file,
  removed,
  onSelect,
  onRemove,
}: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    // Mandatory: without this every re-pick leaks a blob URL.
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Validate client-side against the same rules the server enforces, so the
  // user gets immediate feedback rather than a round-trip 422.
  const accept = (candidate: File | null) => {
    if (!candidate) {
      setLocalError(null)
      onSelect(null)
      return
    }
    if (!ACCEPT.split(',').includes(candidate.type)) {
      setLocalError('Choose a JPG, PNG or WebP image.')
      return
    }
    if (candidate.size > MAX_BYTES) {
      setLocalError('That image is larger than 4 MB.')
      return
    }
    setLocalError(null)
    onSelect(candidate)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    accept(e.dataTransfer.files?.[0] ?? null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  const shownUrl = previewUrl ?? (removed ? null : (currentUrl ?? null))
  const canRemove = Boolean(currentUrl) && !file && !removed

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-slate-200">{label}</span>

      <div
        role="button"
        tabIndex={0}
        aria-label={shownUrl ? 'Replace cover image' : 'Add a cover image'}
        onClick={() => inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'relative flex min-h-32 cursor-pointer items-center justify-center overflow-hidden rounded-xl',
          'border border-dashed bg-ink transition-colors duration-200',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          dragging ? 'border-accent' : 'border-line hover:border-white/30',
        )}
      >
        {shownUrl ? (
          <>
            <img src={shownUrl} alt="" className="h-32 w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-center text-xs text-white backdrop-blur-sm">
              Click or drop to replace
            </span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5 px-4 py-6 text-center text-muted">
            <UploadIcon className="size-5" />
            <span className="text-sm">Drop an image here, or click to browse</span>
            <span className="text-xs">JPG, PNG or WebP · up to 4 MB</span>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0] ?? null)}
      />

      {localError && <p className="text-xs text-accent-soft">{localError}</p>}

      <div className="flex items-center gap-3 text-xs">
        {file && (
          <button
            type="button"
            onClick={() => accept(null)}
            className="text-muted underline-offset-2 hover:text-white hover:underline"
          >
            Discard selection
          </button>
        )}
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted underline-offset-2 hover:text-white hover:underline"
          >
            Remove current cover
          </button>
        )}
        {removed && !file && <span className="text-muted">Cover will be removed on save.</span>}
      </div>
    </div>
  )
}
