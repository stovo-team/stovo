import { describe, it, expect, vi, beforeEach } from 'vitest'
import CallController from './CallController'

const makeSocket = () => ({ emit: vi.fn() } as any)

describe('CallController — default settings', () => {
  let ctrl: CallController

  beforeEach(() => {
    ctrl = new CallController(makeSocket(), 'test-token')
  })

  it('initializes cameraEnabled as true', () => {
    expect(ctrl.getSettings().cameraEnabled).toBe(true)
  })

  it('initializes videoDeviceId as empty string', () => {
    expect(ctrl.getSettings().videoDeviceId).toBe('')
  })

  it('initializes micMuted as false', () => {
    expect(ctrl.getSettings().micMuted).toBe(false)
  })

  it('initializes soundDisabled as false', () => {
    expect(ctrl.getSettings().soundDisabled).toBe(false)
  })

  it('getCapabilities returns canUseCamera as a boolean', () => {
    expect(typeof ctrl.getCapabilities().canUseCamera).toBe('boolean')
  })
})

describe('CallController — cleanup', () => {
  it('does not emit call:end when serverAlreadyNotified is true', async () => {
    const socket = makeSocket()
    const ctrl = new CallController(socket, 'test-token')
    // Simulate an active call chatId via startOutgoing path is heavy; cleanup with
    // serverAlreadyNotified skips emit regardless.
    await ctrl.cleanup(true)
    expect(socket.emit).not.toHaveBeenCalledWith('call:end', expect.anything())
  })

  it('emits call:end on cleanup when a call was active and server not yet notified', async () => {
    const socket = { emit: vi.fn(), connected: true } as any
    const ctrl = new CallController(socket, 'test-token')
    ;(ctrl as any).chatId = 'chat-1'
    await ctrl.cleanup(false)
    expect(socket.emit).toHaveBeenCalledWith('call:end', { chatId: 'chat-1' })
  })
})

describe('CallController — syncRemoteVideoToUI', () => {
  it('invokes onRemoteVideoTrack when a live remote video stream exists', () => {
    const ctrl = new CallController(makeSocket(), 'test-token')
    const onRemoteVideoTrack = vi.fn()
    ctrl.onRemoteVideoTrack = onRemoteVideoTrack
    const track = { kind: 'video', readyState: 'live' } as MediaStreamTrack
    const stream = {
      getVideoTracks: () => [track],
    } as unknown as MediaStream
    ;(ctrl as any).remoteStream = stream

    ctrl.syncRemoteVideoToUI()

    expect(onRemoteVideoTrack).toHaveBeenCalledWith(stream)
  })

  it('does not invoke onRemoteVideoTrack when remote stream has no live video tracks', () => {
    const ctrl = new CallController(makeSocket(), 'test-token')
    const onRemoteVideoTrack = vi.fn()
    ctrl.onRemoteVideoTrack = onRemoteVideoTrack
    const track = { kind: 'video', readyState: 'ended' } as MediaStreamTrack
    const stream = {
      getVideoTracks: () => [track],
    } as unknown as MediaStream
    ;(ctrl as any).remoteStream = stream

    ctrl.syncRemoteVideoToUI()

    expect(onRemoteVideoTrack).not.toHaveBeenCalled()
  })
})

describe('CallController — applySettings', () => {
  let ctrl: CallController

  beforeEach(() => {
    ctrl = new CallController(makeSocket(), 'test-token')
  })

  it('patches cameraEnabled without touching other fields', async () => {
    await ctrl.applySettings({ cameraEnabled: false })
    const s = ctrl.getSettings()
    expect(s.cameraEnabled).toBe(false)
    expect(s.micMuted).toBe(false)
    expect(s.soundDisabled).toBe(false)
  })

  it('patches micMuted', async () => {
    await ctrl.applySettings({ micMuted: true })
    expect(ctrl.getSettings().micMuted).toBe(true)
  })

  it('patches videoDeviceId', async () => {
    await ctrl.applySettings({ videoDeviceId: 'cam-abc' })
    expect(ctrl.getSettings().videoDeviceId).toBe('cam-abc')
  })

  it('patches multiple fields at once', async () => {
    await ctrl.applySettings({ micMuted: true, cameraEnabled: false })
    const s = ctrl.getSettings()
    expect(s.micMuted).toBe(true)
    expect(s.cameraEnabled).toBe(false)
  })
})
