export interface SecureContextInfo {
  isSecureContext: boolean
  protocol: string
  hostname: string
  mediaDevicesPresent: boolean
  getUserMediaPresent: boolean
}

export function probeSecureContext(): SecureContextInfo {
  return {
    isSecureContext: window.isSecureContext,
    protocol: location.protocol,
    hostname: location.hostname,
    mediaDevicesPresent: 'mediaDevices' in navigator && navigator.mediaDevices != null,
    getUserMediaPresent:
      'mediaDevices' in navigator &&
      navigator.mediaDevices != null &&
      typeof navigator.mediaDevices.getUserMedia === 'function',
  }
}

export function isCameraApiAvailable(info: SecureContextInfo): boolean {
  return info.isSecureContext && info.getUserMediaPresent
}
