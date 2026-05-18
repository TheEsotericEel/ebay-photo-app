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
      {/* Full frame border */}
      {started && ratio === 'full' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          border: '1px solid rgba(255,255,255,0.2)',
        }} />
      )}

      {/* Square composition guide for 1:1 ratio */}
      {started && ratio === '1:1' && (
        <>
          {/* Outer square border */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(100%, 100vh)',
            aspectRatio: '1 / 1',
            pointerEvents: 'none',
            border: '2px solid rgba(255, 255, 255, 0.8)',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
          }} />
          {/* Corner guides */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(100%, 100vh)',
            aspectRatio: '1 / 1',
            pointerEvents: 'none',
          }}>
            {/* Top-left corner */}
            <div style={{
              position: 'absolute',
              top: -2,
              left: -2,
              width: 24,
              height: 24,
              borderTop: '4px solid #fff',
              borderLeft: '4px solid #fff',
            }} />
            {/* Top-right corner */}
            <div style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 24,
              height: 24,
              borderTop: '4px solid #fff',
              borderRight: '4px solid #fff',
            }} />
            {/* Bottom-left corner */}
            <div style={{
              position: 'absolute',
              bottom: -2,
              left: -2,
              width: 24,
              height: 24,
              borderBottom: '4px solid #fff',
              borderLeft: '4px solid #fff',
            }} />
            {/* Bottom-right corner */}
            <div style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 24,
              height: 24,
              borderBottom: '4px solid #fff',
              borderRight: '4px solid #fff',
            }} />
          </div>
        </>
      )}
    </div>
  )
})
