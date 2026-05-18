import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { BrowserCameraAdapter, CameraCapabilities } from '../adapters/camera'
import { OutputRatio, getCssAspectRatio } from '../adapters/imageProcessing'

export type PreviewFit = 'full-frame' | 'fill-guide'

export interface CameraPreviewHandle {
  captureFrame: () => ReturnType<BrowserCameraAdapter['captureFrame']>
  getCapabilities: () => CameraCapabilities | null
  getVideoDimensions: () => { videoWidth: number; videoHeight: number } | null
}

interface Props {
  onError: (msg: string) => void
  onStarted: () => void
  onStopped: () => void
  ratio?: OutputRatio
}

export const CameraPreview = forwardRef<CameraPreviewHandle, Props>(function CameraPreview(
  { onError, onStarted, onStopped, ratio = 'full' },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const adapterRef = useRef<BrowserCameraAdapter>(new BrowserCameraAdapter())
  const [started, setStarted] = useState(false)
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null)

  useImperativeHandle(ref, () => ({
    captureFrame: () => adapterRef.current.captureFrame(),
    getCapabilities: () => adapterRef.current.getCapabilities(),
    getVideoDimensions: () => {
      const v = videoRef.current
      if (!v) return null
      return { videoWidth: v.videoWidth, videoHeight: v.videoHeight }
    },
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

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    background: '#000',
    aspectRatio: getCssAspectRatio(ratio, videoDimensions),
    overflow: 'hidden',
  }

  const videoStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    minWidth: '100%',
    minHeight: '100%',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  }

  return (
    <div style={containerStyle}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={videoStyle}
      />
      {started && ratio === 'full' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          border: '1px solid rgba(255,255,255,0.2)',
        }} />
      )}
    </div>
  )
})
