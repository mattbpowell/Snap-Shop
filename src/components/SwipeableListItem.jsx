import { useEffect, useRef, useState } from 'react'
import { CheckIcon, FlagIcon } from './icons.jsx'

/**
 * Swipe-to-check store-mode row.
 *  - Swipe RIGHT past threshold → check (commit)
 *  - Swipe LEFT  past threshold → uncheck (commit, only if currently checked)
 *  - Below threshold → spring back to center
 *  - Tap → toggle (accessibility fallback)
 *  - Vibrates briefly on commit (Android; safe no-op on iOS)
 *
 * Implemented with native pointer events to avoid an extra dependency.
 */

const SWIPE_THRESHOLD = 0.4 // fraction of row width
const MAX_DRAG_FRAC = 0.8
const MIN_TRACK_PX = 8
const SPRING_MS = 200
const HAPTIC_MS = 15

export function SwipeableListItem({ item, onToggle }) {
  const rowRef = useRef(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const tracking = useRef(false)
  const widthRef = useRef(320)
  const cancelClickRef = useRef(false)

  const [dragX, setDragX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)

  useEffect(() => {
    if (rowRef.current) widthRef.current = rowRef.current.offsetWidth || widthRef.current
  })

  const commit = () => {
    try { navigator.vibrate?.(HAPTIC_MS) } catch {}
    onToggle()
    setDragX(0)
    setIsSwiping(false)
  }

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse') return // touch / pen only — desktop uses tap
    startX.current = e.clientX
    startY.current = e.clientY
    tracking.current = false
    cancelClickRef.current = false
    if (rowRef.current) widthRef.current = rowRef.current.offsetWidth
  }

  const onPointerMove = (e) => {
    if (e.buttons === 0 && e.pressure === 0 && !tracking.current) return
    const dx = e.clientX - startX.current
    const dy = e.clientY - startY.current

    if (!tracking.current) {
      // Decide whether this is a horizontal swipe vs a vertical scroll.
      if (Math.abs(dx) < MIN_TRACK_PX || Math.abs(dx) <= Math.abs(dy)) return
      tracking.current = true
      setIsSwiping(true)
      try { rowRef.current?.setPointerCapture?.(e.pointerId) } catch {}
    }

    e.preventDefault?.()
    cancelClickRef.current = true
    const max = widthRef.current * MAX_DRAG_FRAC
    setDragX(Math.max(-max, Math.min(max, dx)))
  }

  const onPointerEnd = (e) => {
    if (!tracking.current) {
      // Treat as tap — let the click handler fire below.
      return
    }
    tracking.current = false
    setIsSwiping(false)
    try { rowRef.current?.releasePointerCapture?.(e.pointerId) } catch {}

    const threshold = widthRef.current * SWIPE_THRESHOLD
    const absDX = Math.abs(dragX)
    const checking = dragX > 0
    const unchecking = dragX < 0

    if (absDX >= threshold) {
      if ((checking && !item.checked) || (unchecking && item.checked)) {
        commit()
        return
      }
    }
    setDragX(0)
  }

  const handleClick = () => {
    if (cancelClickRef.current) {
      cancelClickRef.current = false
      return
    }
    onToggle()
  }

  const width = widthRef.current
  const threshold = width * SWIPE_THRESHOLD
  const progress = Math.min(1, Math.abs(dragX) / Math.max(1, threshold))
  const direction = dragX > 8 ? 'check' : dragX < -8 ? 'uncheck' : 'none'

  // Overlay color & icon hint
  const overlayBg =
    direction === 'check'
      ? `rgba(22, 163, 74, ${0.15 + progress * 0.6})` // brand-600
      : direction === 'uncheck'
        ? `rgba(251, 146, 60, ${0.15 + progress * 0.55})` // amber-400
        : 'transparent'

  const rowStyle = {
    transform: `translateX(${dragX}px)`,
    transition: isSwiping ? 'none' : `transform ${SPRING_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
    willChange: 'transform',
    touchAction: 'pan-y',
  }

  return (
    <div
      ref={rowRef}
      className="relative overflow-hidden border-b border-neutral-100 last:border-b-0"
      role="listitem"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center px-5 pointer-events-none"
        style={{
          backgroundColor: overlayBg,
          justifyContent: direction === 'uncheck' ? 'flex-end' : 'flex-start',
          transition: isSwiping ? 'none' : `background-color ${SPRING_MS}ms ease`,
        }}
      >
        {progress > 0.15 && (
          <span
            className={
              'inline-flex items-center justify-center rounded-full ' +
              (direction === 'check' ? 'bg-brand-600 text-white' : 'bg-amber-500 text-white')
            }
            style={{
              width: 28,
              height: 28,
              opacity: progress,
              transform: `scale(${0.7 + progress * 0.3})`,
            }}
          >
            <CheckIcon
              size={16}
              strokeWidth={2.6}
              style={direction === 'uncheck' ? { transform: 'rotate(180deg)' } : undefined}
            />
          </span>
        )}
      </div>

      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClick={handleClick}
        aria-pressed={item.checked}
        className={
          'relative w-full flex items-center gap-3 px-4 min-h-[60px] text-left ' +
          (item.checked ? 'bg-neutral-50/60' : 'bg-white active:bg-neutral-50') +
          ' select-none'
        }
        style={rowStyle}
      >
        <span
          className={
            'flex-none w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 ' +
            (item.checked
              ? 'bg-brand-600 text-white'
              : 'bg-white border-[1.5px] border-neutral-300 text-transparent')
          }
        >
          <CheckIcon size={15} strokeWidth={2.5} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            {item.flagged && !item.checked && (
              <FlagIcon size={13} className="text-amber-600 flex-none" />
            )}
            <span
              className={
                'block text-[15px] truncate ' +
                (item.checked ? 'line-through text-neutral-400' : 'text-neutral-900')
              }
            >
              {item.name}
            </span>
            {item.quantity && (
              <span
                className={
                  'text-sm font-normal ' +
                  (item.checked ? 'text-neutral-300 line-through' : 'text-neutral-400')
                }
              >
                {item.quantity}
              </span>
            )}
          </span>
          {item.note && (
            <span
              className={
                'block mt-0.5 text-xs truncate ' +
                (item.checked ? 'text-neutral-300' : 'text-neutral-500')
              }
            >
              {item.note}
            </span>
          )}
        </span>
      </button>
    </div>
  )
}
