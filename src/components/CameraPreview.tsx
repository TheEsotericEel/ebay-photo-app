import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { BrowserCameraAdapter, CameraCapabilities, CameraDeviceInfo, CameraTestConstraintSet } from '../adapters/camera'
import { OutputRatio, getCssAspectRatio } from '../adapters/imageProcessing'

export type PreviewFit = 'full-frame' | 'fill-guide'

export interface CameraPreviewHandle {
  captureFrame: () => ReturnType<BrowserCameraAdapter['captureFrame']>
  getCapabilities: () => CameraCapabilities | null
  getVideoDimensions: () => { videoWidth: number; videoHeight: number } | null
  getVideoState: () => { readyState: number; paused: boolean; width: number; height: number; hasSrcObject: boolean } | null
  listVideoInputDevices: () => Promise<CameraDeviceInfo[]>
  applyTestConstraints: (constraints: CameraTestConstraintSet) => Promise<CameraCapabilities | null>
  switchCameraDevice: (deviceId: string) => Promise<CameraCapabilities | null>
  getActiveTrack: () => MediaStreamTrack | null
}

interface Props {
  onError: (msg: string) => void
  onStarted: () => void
  onStopped: () => void
  ratio?: OutputRatio
  fit?: PreviewFit
}

export const CameraPreview = forwardRef<CameraPreviewHandle, Props>(function CameraPreview(
  { onError, onStarted, onStopped, ratio = 'full', fit = 'fill-guide' },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const adapterRef = useRef<BrowserCameraAdapter>(new BrowserCameraAdapter())
  const [started, setStarted] = useState(false)
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null)
  const isSquareFullFrame = fit === 'full-frame' && ratio === '1:1'

  useImperativeHandle(ref, () => ({
    captureFrame: () => adapterRef.current.captureFrame(),
    getCapabilities: () => adapterRef.current.getCapabilities(),
    getVideoDimensions: () => {
      const v = videoRef.current
      if (!v) return null
      return { videoWidth: v.videoWidth, videoHeight: v.videoHeight }
    },
    getVideoState: () => {
      const v = videoRef.current
      if (!v) return null
      return {
        readyState: v.readyState,
        paused: v.paused,
        width: v.videoWidth,
        height: v.videoHeight,
        hasSrcObject: Boolean(v.srcObject),
      }
    },
    listVideoInputDevices: () => adapterRef.current.listVideoInputDevices(),
    applyTestConstraints: (constraints: CameraTestConstraintSet) => adapterRef.current.applyTestConstraints(constraints),
    switchCameraDevice: (deviceId: string) => adapterRef.current.switchDevice(deviceId),
    getActiveTrack: () => adapterRef.current.getActiveTrack(),
  }))

  useEffect(() => {
    const adapter = adapterRef.current
    const videoEl = videoRef.current
    if (!videoEl) return

    adapter
      .start(videoEl)
      .then(() => {
        setStarted(true)
        onStarted()
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        onError(`Camera start failed: ${msg}`)
      })

    return () => {
      adapter.stop()
      setStarted(false)
      onStopped()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listen for video metadata to get actual dimensions
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleLoadedMetadata = () => {
      setVideoDimensions({
        width: video.videoWidth,
        height: video.videoHeight,
      })
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata)
  }, [])

  const containerStyle: React.CSSProperties = isSquareFullFrame
    ? {
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        background: '#000',
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '12dvh',
      }
    : fit === 'full-frame'
    ? {
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        background: '#000',
        overflow: 'hidden',
      }
    : {
        position: 'relative',
        width: '100%',
        background: '#000',
        aspectRatio: getCssAspectRatio(ratio, videoDimensions),
        overflow: 'hidden',
      }

  const frameStyle: React.CSSProperties = isSquareFullFrame
    ? {
        position: 'relative',
        width: 'min(calc(100vw - 24px), calc(100dvh - 312px))',
        maxWidth: '100%',
        aspectRatio: '1 / 1',
        overflow: 'hidden',
        background: '#000',
        border: '2px solid rgba(255, 255, 255, 0.8)',
        boxSizing: 'border-box',
        boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.2)',
      }
    : fit === 'full-frame'
    ? {
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#000',
      }
    : {
        position: 'relative',
        width: '100%',
        background: '#000',
        aspectRatio: getCssAspectRatio(ratio, videoDimensions),
        overflow: 'hidden',
      }

  const videoStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center 40%',
  }

  return (
    <div style={containerStyle}>
      <div style={frameStyle}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={videoStyle}
        />
        {started && ratio === 'full' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          />
        )}
        {started && ratio === '1:1' && isSquareFullFrame && (
          <>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                border: '2px solid rgba(255, 255, 255, 0.8)',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: -2,
                  left: -2,
                  width: 24,
                  height: 24,
                  borderTop: '4px solid #fff',
                  borderLeft: '4px solid #fff',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 24,
                  height: 24,
                  borderTop: '4px solid #fff',
                  borderRight: '4px solid #fff',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: -2,
                  left: -2,
                  width: 24,
                  height: 24,
                  borderBottom: '4px solid #fff',
                  borderLeft: '4px solid #fff',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: 24,
                  height: 24,
                  borderBottom: '4px solid #fff',
                  borderRight: '4px solid #fff',
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
})
