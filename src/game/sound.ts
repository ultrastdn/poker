/**
 * 合成音效：全部用 Web Audio 现场生成，不引入任何音频素材，符合项目「零外部图片/媒体」的风格。
 * AudioContext 需由用户手势触发，故在首次 playSound（点击开始牌局等）时惰性创建。
 */

export type SoundName = 'deal' | 'chip' | 'fold' | 'check' | 'win' | 'click' | 'tick'

let context: AudioContext | null = null
let enabled = true
let noiseBuffer: AudioBuffer | null = null

export function setSoundEnabled(value: boolean): void {
  enabled = value
}

function audio(): AudioContext | null {
  if (!enabled) return null
  try {
    const Ctor: typeof AudioContext | undefined =
      globalThis.AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    if (!context) context = new Ctor()
    if (context.state === 'suspended') void context.resume()
    return context
  } catch {
    return null
  }
}

function tone(
  ac: AudioContext,
  freq: number,
  duration: number,
  gainPeak: number,
  type: OscillatorType = 'sine',
  slideTo?: number,
): void {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  const now = ac.currentTime
  osc.type = type
  osc.frequency.setValueAtTime(freq, now)
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + duration)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  osc.connect(gain).connect(ac.destination)
  osc.start(now)
  osc.stop(now + duration + 0.02)
}

function noise(ac: AudioContext, duration: number, gainPeak: number, filterFreq: number): void {
  if (!noiseBuffer) {
    const length = Math.floor(ac.sampleRate * 0.4)
    noiseBuffer = ac.createBuffer(1, length, ac.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  }
  const source = ac.createBufferSource()
  source.buffer = noiseBuffer
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = filterFreq
  const gain = ac.createGain()
  const now = ac.currentTime
  gain.gain.setValueAtTime(gainPeak, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  source.connect(filter).connect(gain).connect(ac.destination)
  source.start(now)
  source.stop(now + duration + 0.02)
}

export function playSound(name: SoundName): void {
  const ac = audio()
  if (!ac) return
  switch (name) {
    case 'deal':
      noise(ac, 0.09, 0.22, 2600)
      break
    case 'chip':
      noise(ac, 0.07, 0.3, 1800)
      tone(ac, 620, 0.08, 0.12, 'triangle')
      break
    case 'check':
      tone(ac, 320, 0.07, 0.12, 'sine')
      break
    case 'fold':
      noise(ac, 0.12, 0.16, 900)
      break
    case 'click':
      tone(ac, 480, 0.05, 0.1, 'square')
      break
    case 'tick':
      tone(ac, 880, 0.04, 0.06, 'square')
      break
    case 'win':
      tone(ac, 523, 0.12, 0.16, 'triangle')
      window.setTimeout(() => tone(audio() ?? ac, 659, 0.12, 0.16, 'triangle'), 110)
      window.setTimeout(() => tone(audio() ?? ac, 784, 0.22, 0.18, 'triangle'), 220)
      break
  }
}
