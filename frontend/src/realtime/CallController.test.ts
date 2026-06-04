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
