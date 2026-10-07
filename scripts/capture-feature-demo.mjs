import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Pass the supported @Browser tab handle. No separate browser driver is used.
// Continuously capture real frames; click coordinates become editorial overlays.
export async function createDemoRecorder(tab, directory) {
  const root = resolve(directory)
  await mkdir(resolve(root, 'recordings'), { recursive: true })
  let recordings = []
  try { recordings = JSON.parse(await readFile(resolve(root, 'recordings.json'), 'utf8')) } catch { /* first run */ }
  let current, active, task
  const elapsed = () => (Date.now() - current.started) / 1000
  const hold = milliseconds => tab.playwright.waitForTimeout(milliseconds)
  async function start(name, caption) {
    const viewport = await tab.playwright.evaluate(() => ({ width: innerWidth, height: innerHeight }))
    current = { name, viewport, started: Date.now(), frames: [], events: [], captions: [{ time: 0, text: caption }] }
    active = true
    task = (async () => {
      while (active) {
        const time = elapsed()
        const image = await tab.screenshot({ fullPage: false })
        const path = resolve(root, 'recordings', `${name}-${String(current.frames.length).padStart(5, '0')}.jpg`)
        await writeFile(path, image)
        current.frames.push({ time, path })
      }
    })()
  }
  async function action(locator, caption, fn) {
    const point = await locator.evaluate(el => {
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    if (point.y < 0 || point.y > current.viewport.height || point.x < 0 || point.x > current.viewport.width) {
      throw new Error('Recording target must be visible before its pointer coordinates are captured')
    }
    current.events.push({ time: elapsed(), ...point })
    current.captions.push({ time: elapsed(), text: caption })
    await fn()
    await tab.getAXState({ emit: false })
  }
  async function stop() {
    active = false
    await task
    current.duration = elapsed()
    recordings = recordings.filter(item => item.name !== current.name)
    recordings.push(current)
    await writeFile(resolve(root, 'recordings.json'), JSON.stringify(recordings, null, 2))
    return { name: current.name, duration: current.duration, frames: current.frames.length }
  }
  return { start, action, hold, stop }
}
