import { CameraCapabilities, CaptureDiagnostics } from '../adapters/camera'
import { SecureContextInfo } from '../adapters/secureContext'

interface Props {
  cameraState: 'idle' | 'starting' | 'active' | 'stopped' | 'error'
  capabilities: CameraCapabilities | null
  captureErrors: string[]
  storageErrors: string[]
  secureContext: SecureContextInfo
  lastCaptureDiagnostics?: CaptureDiagnostics | null
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    lineHeight: 1.6,
    fontFamily: 'monospace',
    color: '#ccc',
    marginTop: 12,
  },
  heading: {
    color: '#aaa',
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 10,
  },
  row: { display: 'flex', gap: 8, alignItems: 'baseline' },
  label: { color: '#666', minWidth: 110 },
  ok: { color: '#4caf50' },
  warn: { color: '#ff9800' },
  err: { color: '#f44336' },
}

export function DiagnosticsPanel({ cameraState, capabilities, captureErrors, storageErrors, secureContext, lastCaptureDiagnostics }: Props) {
  return (
    <div style={s.panel}>
      <div style={{ ...s.heading, marginTop: 0 }}>Context</div>
      <CapRow label="isSecureContext" val={secureContext.isSecureContext} />
      <div style={s.row}>
        <span style={s.label}>protocol</span>
        <span style={secureContext.protocol === 'https:' || secureContext.hostname === 'localhost' ? s.ok : s.err}>
          {secureContext.protocol}
        </span>
      </div>
      <div style={s.row}>
        <span style={s.label}>hostname</span>
        <span>{secureContext.hostname}</span>
      </div>
      <CapRow label="mediaDevices" val={secureContext.mediaDevicesPresent} />
      <CapRow label="getUserMedia" val={secureContext.getUserMediaPresent} />
      {!secureContext.isSecureContext && (
        <div style={{ ...s.err, marginTop: 6, lineHeight: 1.5 }}>
          ⚠ Not a secure context. Camera API will not work here.
          Use HTTPS or a tunnel — see docs/PHASE0_TESTING.md
        </div>
      )}

      <div style={s.heading}>Camera</div>
      <div style={s.row}>
        <span style={s.label}>state</span>
        <span style={cameraState === 'active' ? s.ok : cameraState === 'error' ? s.err : s.warn}>
          {cameraState}
        </span>
      </div>

      {capabilities && (
        <>
          {capabilities.trackSettings && (
            <>
              <div style={s.heading}>Track Settings</div>
              <TextRow label="videoWidth" val={capabilities.trackSettings.width?.toString() ?? '?'} />
              <TextRow label="videoHeight" val={capabilities.trackSettings.height?.toString() ?? '?'} />
              <TextRow
                label="aspectRatio"
                val={capabilities.trackSettings.aspectRatio?.toFixed(3) ?? '?'}
              />
              <TextRow label="facingMode" val={capabilities.trackSettings.facingMode ?? '?'} />
              {capabilities.trackSettings.zoom !== undefined && (
                <TextRow label="zoom (active)" val={String(capabilities.trackSettings.zoom)} />
              )}
              {capabilities.trackSettings.frameRate !== undefined && (
                <TextRow label="frameRate" val={capabilities.trackSettings.frameRate.toString()} />
              )}
            </>
          )}
          {lastCaptureDiagnostics?.previewQualityAttempted !== undefined && (
            <>
              <div style={s.heading}>Preview Quality</div>
              <TextRow
                label="attempted"
                val={lastCaptureDiagnostics.previewQualityAttempted ? 'yes' : 'no'}
              />
              {lastCaptureDiagnostics.previewQualityRequestedConstraints && (
                <TextRow
                  label="requested"
                  val={lastCaptureDiagnostics.previewQualityRequestedConstraints.join(' | ')}
                />
              )}
              <TextRow
                label="applied"
                val={
                  lastCaptureDiagnostics.previewQualityApplied === undefined
                    ? '?'
                    : lastCaptureDiagnostics.previewQualityApplied
                      ? 'yes'
                      : 'no'
                }
              />
              {lastCaptureDiagnostics.previewQualityError && (
                <div style={s.err}>{lastCaptureDiagnostics.previewQualityError}</div>
              )}
              {lastCaptureDiagnostics.previewQualityTrackSettings && (
                <>
                  <TextRow
                    label="previewW"
                    val={lastCaptureDiagnostics.previewQualityTrackSettings.width?.toString() ?? '?'}
                  />
                  <TextRow
                    label="previewH"
                    val={lastCaptureDiagnostics.previewQualityTrackSettings.height?.toString() ?? '?'}
                  />
                  <TextRow
                    label="previewFPS"
                    val={lastCaptureDiagnostics.previewQualityTrackSettings.frameRate?.toString() ?? '?'}
                  />
                </>
              )}
            </>
          )}
          <div style={s.heading}>Capabilities</div>
          <CapRow label="zoom" val={capabilities.zoom} />
          <CapRow label="torch" val={capabilities.torch} />
          <CapRow
            label="facingModes"
            val={capabilities.facingModes.length > 0}
            detail={capabilities.facingModes.join(', ') || '(none)'}
          />
          <CapRow
            label="focusModes"
            val={capabilities.focusMode.length > 0}
            detail={capabilities.focusMode.join(', ') || '(none)'}
          />
          <div style={s.row}>
            <span style={s.label}>device label</span>
            <span>{capabilities.deviceLabels[0] ?? '(unknown)'}</span>
          </div>
          {capabilities.raw && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', color: '#666' }}>raw capabilities JSON</summary>
              <pre style={{ marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#888', fontSize: 10 }}>
                {JSON.stringify(capabilities.raw, null, 2)}
              </pre>
            </details>
          )}
        </>
      )}

      {captureErrors.length > 0 && (
        <>
          <div style={s.heading}>Capture Errors</div>
          {captureErrors.map((e, i) => (
            <div key={i} style={s.err}>{e}</div>
          ))}
        </>
      )}

      {storageErrors.length > 0 && (
        <>
          <div style={s.heading}>Storage Errors</div>
          {storageErrors.map((e, i) => (
            <div key={i} style={s.err}>{e}</div>
          ))}
        </>
      )}

      {lastCaptureDiagnostics && (
        <>
          <div style={s.heading}>Last Capture</div>

          {lastCaptureDiagnostics.upscaleRisk && (
            <div style={{ ...s.err, marginBottom: 4 }}>⚠ Low-res fallback — upscale risk</div>
          )}

          <TextRow label="initialStreamWidth" val={lastCaptureDiagnostics.initialStreamWidth?.toString() ?? '?'} />
          <TextRow label="initialStreamHeight" val={lastCaptureDiagnostics.initialStreamHeight?.toString() ?? '?'} />

          {lastCaptureDiagnostics.preCaptureTrackSettings && (
            <>
              <TextRow label="preCaptureTrackW" val={lastCaptureDiagnostics.preCaptureTrackSettings.width?.toString() ?? '?'} />
              <TextRow label="preCaptureTrackH" val={lastCaptureDiagnostics.preCaptureTrackSettings.height?.toString() ?? '?'} />
            </>
          )}

          <div style={s.row}>
            <span style={s.label}>takePhotoFirst</span>
            <span style={lastCaptureDiagnostics.takePhotoFirstAttemptSuccess ? s.ok : s.warn}>
              {lastCaptureDiagnostics.takePhotoFirstAttemptSuccess === undefined ? '?' :
               lastCaptureDiagnostics.takePhotoFirstAttemptSuccess ? 'ok' : 'fail'}
            </span>
            {lastCaptureDiagnostics.takePhotoFirstAttemptError && (
              <span style={{ ...s.err, fontSize: 10, flexShrink: 1, wordBreak: 'break-all' }}>
                {lastCaptureDiagnostics.takePhotoFirstAttemptError}
              </span>
            )}
          </div>

          <div style={s.row}>
            <span style={s.label}>highResUpgrade</span>
            <span style={lastCaptureDiagnostics.highResUpgradeAttempted ? s.warn : s.ok}>
              {lastCaptureDiagnostics.highResUpgradeAttempted === undefined ? '?' :
               lastCaptureDiagnostics.highResUpgradeAttempted ? 'yes' : 'no'}
            </span>
          </div>

          {lastCaptureDiagnostics.highResConstraintCandidatesAttempted && (
            <TextRow
              label="upgradeAttempted"
              val={lastCaptureDiagnostics.highResConstraintCandidatesAttempted.join(', ')}
            />
          )}

          {lastCaptureDiagnostics.postUpgradeTrackSettings && (
            <>
              <TextRow label="postUpgradeW" val={lastCaptureDiagnostics.postUpgradeTrackSettings.width?.toString() ?? '?'} />
              <TextRow label="postUpgradeH" val={lastCaptureDiagnostics.postUpgradeTrackSettings.height?.toString() ?? '?'} />
            </>
          )}

          {lastCaptureDiagnostics.selectedRatio && (
            <TextRow label="selectedRatio" val={lastCaptureDiagnostics.selectedRatio} />
          )}

          {lastCaptureDiagnostics.highResUpgradeAttempted && (
            <div style={s.row}>
              <span style={s.label}>takePhotoRetry</span>
              <span style={lastCaptureDiagnostics.takePhotoRetrySuccess ? s.ok : s.warn}>
                {lastCaptureDiagnostics.takePhotoRetrySuccess === undefined ? '?' :
                 lastCaptureDiagnostics.takePhotoRetrySuccess ? 'ok' : 'fail'}
              </span>
              {lastCaptureDiagnostics.takePhotoRetryError && (
                <span style={{ ...s.err, fontSize: 10, flexShrink: 1, wordBreak: 'break-all' }}>
                  {lastCaptureDiagnostics.takePhotoRetryError}
                </span>
              )}
            </div>
          )}

          <TextRow label="captureMethod" val={lastCaptureDiagnostics.captureMethod ?? '?'} />
          <TextRow label="originalCaptureWidth" val={lastCaptureDiagnostics.takePhotoWidth?.toString() ?? '?'} />
          <TextRow label="originalCaptureHeight" val={lastCaptureDiagnostics.takePhotoHeight?.toString() ?? '?'} />
          <TextRow
            label="originalByteSize"
            val={lastCaptureDiagnostics.originalByteSize
              ? `${(lastCaptureDiagnostics.originalByteSize / 1024).toFixed(0)}KB`
              : '?'}
          />
          <TextRow label="processedWidth" val={lastCaptureDiagnostics.processedWidth?.toString() ?? '?'} />
          <TextRow label="processedHeight" val={lastCaptureDiagnostics.processedHeight?.toString() ?? '?'} />
          <TextRow
            label="processedByteSize"
            val={lastCaptureDiagnostics.processedByteSize
              ? `${(lastCaptureDiagnostics.processedByteSize / 1024).toFixed(0)}KB`
              : '?'}
          />
          <div style={s.row}>
            <span style={s.label}>downscaledFromOrig</span>
            <span style={lastCaptureDiagnostics.downscaledFromOriginal ? s.ok : s.warn}>
              {lastCaptureDiagnostics.downscaledFromOriginal ? 'yes' : 'no'}
            </span>
          </div>
          <div style={s.row}>
            <span style={s.label}>upscaleRisk</span>
            <span style={lastCaptureDiagnostics.upscaleRisk ? s.err : s.ok}>
              {lastCaptureDiagnostics.upscaleRisk ? 'yes ⚠️' : 'no'}
            </span>
          </div>

          {lastCaptureDiagnostics.capabilitiesWidthMax && (
            <TextRow label="capsWidthMax" val={lastCaptureDiagnostics.capabilitiesWidthMax.toString()} />
          )}
          {lastCaptureDiagnostics.capabilitiesHeightMax && (
            <TextRow label="capsHeightMax" val={lastCaptureDiagnostics.capabilitiesHeightMax.toString()} />
          )}

          {lastCaptureDiagnostics.errors && lastCaptureDiagnostics.errors.length > 0 && (
            <>
              <div style={s.heading}>Capture Errors</div>
              {lastCaptureDiagnostics.errors.map((e, i) => (
                <div key={i} style={s.err}>{e}</div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}

function CapRow({ label, val, detail }: { label: string; val: boolean; detail?: string }) {
  return (
    <div style={s.row}>
      <span style={s.label}>{label}</span>
      <span style={val ? s.ok : s.warn}>{val ? 'yes' : 'no'}</span>
      {detail && <span style={{ color: '#888' }}>({detail})</span>}
    </div>
  )
}

function TextRow({ label, val }: { label: string; val: string }) {
  return (
    <div style={s.row}>
      <span style={s.label}>{label}</span>
      <span style={{ color: '#ccc' }}>{val}</span>
    </div>
  )
}
