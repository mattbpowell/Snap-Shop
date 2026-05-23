import { useEffect, useRef, useState } from 'react'
import { useClaude } from '../hooks/useClaude.js'
import { usePWAInstallPrompt } from '../hooks/usePWAInstallPrompt.js'
import { IOSInstallBanner } from './IOSInstallBanner.jsx'
import { BlurRetakeSheet } from './BlurRetakeSheet.jsx'
import { isNative, takePhoto, takeFromLibrary } from '../lib/platform.js'
import {
  CameraIcon,
  ImageIcon,
  ScanTextIcon,
  ChevronRightIcon,
  ClockIcon,
  LogoMark,
  XIcon
} from './icons.jsx'

export function UploadScreen({ onListReady, existingList, onResume, history }) {
  const {
    loading,
    status,
    error,
    parseList,
    provider,
    ollamaModel,
    ollamaUrl,
    pingOllama,
    clearError,
  } = useClaude()
  const pwa = usePWAInstallPrompt()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [text, setText] = useState('')
  const [blurWarning, setBlurWarning] = useState(null)
  const [showBlurSheet, setShowBlurSheet] = useState(false)
  const [pendingItems, setPendingItems] = useState(null)
  const [pingState, setPingState] = useState({ status: 'idle', result: null })

  const runPing = async () => {
    setPingState({ status: 'pending', result: null })
    try {
      const result = await pingOllama()
      setPingState({ status: 'done', result })
    } catch (e) {
      setPingState({
        status: 'done',
        result: { ok: false, kind: 'unknown', message: e?.message || 'Ping failed' }
      })
    }
  }

  // Auto-ping once on mount when Ollama is the active provider so the user
  // sees the connection state immediately.
  useEffect(() => {
    if (provider !== 'ollama') return
    runPing()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])
  const cameraRef = useRef(null)
  const uploadRef = useRef(null)

  // True when running inside the Capacitor iOS/Android shell. On native we
  // prefer the system camera UI (`@capacitor/camera`) over a hidden
  // `<input type=file capture=environment>`, which behaves poorly inside
  // WKWebView per research 2026-05-10 Phase 2 notes. The hidden inputs stay
  // mounted as a fallback so a failed native call still has a path forward.
  const NATIVE_CAPTURE = isNative()

  const handleFile = (f) => {
    if (!f) return
    setFile(f)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(f))
    clearError()
    setBlurWarning(null)
  }

  /**
   * Native-aware capture handler. When Capacitor is present, route through
   * `takePhoto()` / `takeFromLibrary()` and synthesize a File from the Blob
   * so downstream code (which currently checks `file?.name`) keeps working.
   * On the web, fall through to the hidden file input — same as before.
   */
  const captureNative = async (source /* 'camera' | 'library' */) => {
    if (!NATIVE_CAPTURE) {
      const ref = source === 'library' ? uploadRef : cameraRef
      ref.current?.click()
      return
    }
    try {
      const blob = source === 'library' ? await takeFromLibrary() : await takePhoto()
      if (!blob) return  // user cancelled
      const ext = (blob.type.split('/')[1] || 'jpg').toLowerCase()
      const synthFile = new File([blob], `snap-${Date.now()}.${ext}`, { type: blob.type })
      handleFile(synthFile)
    } catch {
      // Last-resort fallback to the web input on any unexpected error.
      const ref = source === 'library' ? uploadRef : cameraRef
      ref.current?.click()
    }
  }

  const clearFile = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
  }

  const submit = async () => {
    if (!file && !text.trim()) return
    setBlurWarning(null)
    setShowBlurSheet(false)
    setPendingItems(null)
    try {
      const result = await parseList({ file, text })
      if (result.blurWarning) {
        // Hold the parsed items, ask the user whether to retake or proceed.
        setBlurWarning(result.blurWarning)
        setPendingItems(result.items)
        setShowBlurSheet(true)
        return
      }
      onListReady(result.items)
      // First scan succeeded — prompt the user to install the PWA at the "aha" moment.
      pwa.triggerAfterSuccessfulScan()
    } catch {}
  }

  const proceedWithPending = () => {
    setShowBlurSheet(false)
    if (pendingItems) {
      onListReady(pendingItems)
      pwa.triggerAfterSuccessfulScan()
    }
    setPendingItems(null)
    setBlurWarning(null)
  }

  const retakePhoto = () => {
    setShowBlurSheet(false)
    setPendingItems(null)
    setBlurWarning(null)
    clearFile()
    captureNative('camera')
  }

  const canSubmit = (file || text.trim()) && !loading

  return (
    <div className="max-w-xl mx-auto px-5 py-8 pb-44">
      <header className="mb-8 flex items-center gap-3">
        <span className="inline-flex w-10 h-10 rounded-xl bg-brand-600 text-white items-center justify-center shadow-soft">
          <LogoMark size={22} strokeWidth={1.8} />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Snap & Shop
          </h1>
          <p className="text-xs text-neutral-500">
            From scribbled list to smart checklist.
          </p>
        </div>
      </header>

      {existingList && existingList.items.length > 0 && (
        <button
          type="button"
          onClick={onResume}
          className="group w-full mb-6 flex items-center gap-3 p-4 rounded-2xl bg-brand-50 border border-brand-100 text-left hover:border-brand-200 transition animate-fade-up"
        >
          <span className="flex-none w-10 h-10 rounded-full bg-white border border-brand-100 flex items-center justify-center text-brand-700">
            <ClockIcon size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-neutral-900">
              Resume your list
            </span>
            <span className="block text-xs text-neutral-500">
              {existingList.items.length} items ·{' '}
              {existingList.items.filter(i => i.checked).length} checked
            </span>
          </span>
          <ChevronRightIcon className="text-brand-700 transition group-hover:translate-x-0.5" size={18} />
        </button>
      )}

      {provider === 'ollama' && (() => {
        const r = pingState.result
        const pending = pingState.status === 'pending'
        const ok = !pending && r?.ok
        const failed = !pending && r && !r.ok
        const modelMissing = ok && r.modelMissing

        const dotClass = pending
          ? 'bg-neutral-300 animate-pulse'
          : ok && !modelMissing
            ? 'bg-green-500'
            : ok && modelMissing
              ? 'bg-amber-500'
              : failed
                ? 'bg-red-500'
                : 'bg-neutral-300'

        return (
          <div
            className={
              'mb-6 rounded-xl border text-sm transition-colors ' +
              (failed
                ? 'bg-red-50 border-red-200 text-red-900'
                : modelMissing
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-neutral-50 border-neutral-200 text-neutral-700')
            }
          >
            <div className="p-3 flex items-center gap-2">
              <span className={'w-2 h-2 rounded-full flex-none ' + dotClass} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">Local model</span>
                  <span className="font-mono text-xs text-neutral-500 truncate">{ollamaModel}</span>
                  {ok && !modelMissing && r.latencyMs != null && (
                    <span className="text-xs text-neutral-400 tabular-nums">{r.latencyMs}ms</span>
                  )}
                </div>
                <div className="text-xs text-neutral-500 truncate">{ollamaUrl}</div>
              </div>
              <button
                type="button"
                onClick={runPing}
                disabled={pending}
                className="text-xs font-medium px-2 py-1 rounded-md bg-white border border-neutral-200 hover:border-neutral-300 disabled:opacity-50 transition"
              >
                {pending ? 'Testing…' : 'Test'}
              </button>
            </div>
            {failed && (
              <div className="px-3 pb-3 -mt-1 text-xs leading-relaxed">
                <div className="font-medium mb-0.5">{r.message}</div>
                {r.suggestion && <div className="opacity-90">{r.suggestion}</div>}
                {r.error && (
                  <details className="mt-1 opacity-80">
                    <summary className="cursor-pointer select-none">Technical detail</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px]">{r.error}</pre>
                  </details>
                )}
              </div>
            )}
            {modelMissing && (
              <div className="px-3 pb-3 -mt-1 text-xs leading-relaxed">
                Connected, but <span className="font-mono">{ollamaModel}</span> isn't installed.
                Pull it: <span className="font-mono">ollama pull {ollamaModel}</span>
                {r.models?.length > 0 && (
                  <div className="mt-1 opacity-80">
                    Installed: {r.models.slice(0, 4).join(', ')}{r.models.length > 4 ? '…' : ''}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {provider === 'anthropic' && (
        <div className="mb-6 p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-sm text-neutral-600 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-500 flex-none" />
          <span className="flex-1">
            Cloud model · <span className="font-mono text-xs">claude-sonnet-4-5</span>
          </span>
          <span className="text-xs text-neutral-400">
            Unset <span className="font-mono">VITE_ANTHROPIC_API_KEY</span> to use Ollama
          </span>
        </div>
      )}


      <div className="card p-6">
        {preview ? (
          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden bg-neutral-100">
              <img
                src={preview}
                alt=""
                className="w-full max-h-72 object-contain"
              />
              <button
                type="button"
                onClick={clearFile}
                aria-label="Remove image"
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 backdrop-blur"
              >
                <XIcon size={16} />
              </button>
            </div>
            <p className="text-xs text-neutral-500 truncate">{file?.name}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center text-center mb-5">
              <span className="inline-flex w-14 h-14 rounded-2xl bg-brand-50 text-brand-700 items-center justify-center mb-3">
                <ScanTextIcon size={28} strokeWidth={1.5} />
              </span>
              <h2 className="text-base font-medium text-neutral-900">
                Upload your list
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Photo of a note, whiteboard, or screenshot
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => captureNative('camera')}
                className="btn-secondary px-3 py-3 rounded-xl"
              >
                <CameraIcon size={18} />
                <span className="text-sm">Camera</span>
              </button>
              <button
                type="button"
                onClick={() => captureNative('library')}
                className="btn-secondary px-3 py-3 rounded-xl"
              >
                <ImageIcon size={18} />
                <span className="text-sm">Screenshot</span>
              </button>
            </div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0])}
            />
            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0])}
            />
          </>
        )}
      </div>

      <div className="my-6 flex items-center gap-3 text-neutral-400">
        <div className="flex-1 h-px bg-neutral-200" />
        <span className="text-[11px] font-medium uppercase tracking-[0.12em]">or type / describe</span>
        <div className="flex-1 h-px bg-neutral-200" />
      </div>

      <label htmlFor="list-input" className="block text-xs text-neutral-500 mb-1.5">
        Type a list, or describe meals — we'll figure out the ingredients.
      </label>
      <textarea
        id="list-input"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={'milk, eggs, bread, chx brst x2\n\n— or —\n\nTacos Tuesday, spaghetti Wednesday, smoothies for breakfast all week'}
        rows={6}
        className="input-base resize-y leading-relaxed"
      />

      {error && (
        <div
          role="alert"
          className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start justify-between gap-2"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={clearError}
            aria-label="Dismiss"
            className="flex-none text-red-500 hover:text-red-700"
          >
            <XIcon size={16} />
          </button>
        </div>
      )}

      <div className="fixed bottom-[88px] left-0 right-0 p-4 bg-white/90 backdrop-blur border-t border-neutral-200/70 shadow-dock">
        <div className="max-w-xl mx-auto">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="btn-primary w-full py-3.5 rounded-xl text-base"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                {status || 'Reading your list…'}
              </span>
            ) : (
              <>
                Build my list
                <ChevronRightIcon size={18} />
              </>
            )}
          </button>
        </div>
      </div>

      {history && history.length > 0 && (
        <details className="mt-6 text-neutral-500">
          <summary className="cursor-pointer text-xs uppercase tracking-wider flex items-center gap-2 select-none">
            <ClockIcon size={14} />
            Recent ({history.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {history.map(h => (
              <li
                key={h.id}
                className="flex justify-between px-3 py-2 rounded-lg bg-white border border-neutral-100"
              >
                <span>{new Date(h.date).toLocaleDateString()}</span>
                <span className="text-neutral-400">{h.count} items</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {showBlurSheet && (
        <BlurRetakeSheet
          variant="pre-api"
          onRetake={retakePhoto}
          onContinue={proceedWithPending}
        />
      )}

      {pwa.showIOSBanner && !showBlurSheet && (
        <IOSInstallBanner onDismiss={pwa.dismissIOSBanner} />
      )}
    </div>
  )
}
