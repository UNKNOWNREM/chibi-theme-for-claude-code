import type { EngineInterface, Register, Timer } from 'claude-code'

import { isSetName, parseScene, sceneFor, sceneName } from './scene'
import type { SetName, State } from './scene'

const COMMAND = 'chibi'
const SET_KEY = 'set'
const SET_NAMES = 'owl（原創）、book（抱書）'

// 狀態對應的情境：
//   idle      待機：開啟時、被中斷時、出錯後的回合結束
//   thinking  思考：你送出提問後
//   working   工作：Claude 執行工具時
//   error     出錯：工具失敗或被拒絕
//   happy     開心：回合順利結束（6 秒後回待機）
//   rest      休息：待機超過 5 分鐘沒有任何動作
const HAPPY_MS = 6000
const REST_MS = 5 * 60 * 1000
const DEMO_MS = 3500
const ORDER: State[] = ['idle', 'thinking', 'working', 'happy', 'error', 'rest']

// 模組變數：重載後歸零
let current: State = 'idle'
let activeSet: SetName = 'owl'
let isOn = true
let isDemo = false
let hadError = false
let demoIndex = 0
let timer: Timer | undefined

function cancelTimer(): void {
  timer?.cancel()
  timer = undefined
}

// 切換狀態 = 以另一個場景名重設主題；失敗只回報狀態列，絕不影響對話或工具
async function show($: EngineInterface, state: State, force = false): Promise<void> {
  if (!isOn || (!force && (isDemo || state === current))) return
  current = state
  cancelTimer()

  try {
    const set = await $.theme.set({ backdrop: { scene: sceneName(activeSet, state), glass: false } })
    if (!set.isDrawn) $.ui.status(set.reason)
  } catch (error) {
    $.ui.status(`chibi: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (isDemo) return
  if (state === 'happy') timer = $.clock.after(HAPPY_MS, () => void show($, 'idle'))
  if (state === 'idle') timer = $.clock.after(REST_MS, () => void show($, 'rest'))
}

function stopDemo(): void {
  isDemo = false
  cancelTimer()
}

async function demoStep($: EngineInterface): Promise<void> {
  if (!isDemo) return
  const state = ORDER[demoIndex % ORDER.length] ?? 'idle'
  demoIndex += 1
  await show($, state, true)
  if (isDemo) timer = $.clock.after(DEMO_MS, () => void demoStep($))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Q 版小人：/chibi on 開啟，off 關閉，demo 輪替預覽，set 換圖組（owl、book）',
    })
    const saved = await $.store.get(SET_KEY)
    if (isSetName(saved)) activeSet = saved
    await show($, 'idle', true)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const [arg = '', name] = e.args.trim().toLowerCase().split(/\s+/)

    if (arg === 'set') {
      if (!isSetName(name)) return { text: `目前圖組：${activeSet}。用法：/chibi set owl 或 /chibi set book（可選：${SET_NAMES}）` }
      activeSet = name
      await $.store.set(SET_KEY, name)
      await show($, current, true)
      return { text: `已換成圖組 ${name}，下次開啟也會沿用。` }
    }

    if (arg === 'demo') {
      stopDemo()
      isOn = true
      isDemo = true
      demoIndex = 0
      await demoStep($)
      return { text: `預覽輪替中：每 ${DEMO_MS / 1000} 秒依序換 待機 → 思考 → 工作 → 開心 → 出錯 → 休息。/chibi on 結束輪替。` }
    }

    if (arg === 'off') {
      stopDemo()
      isOn = false
      await $.theme.clear()
      return { text: '小人已關閉。/chibi on 可再開啟。' }
    }

    if (arg === '' || arg === 'on') {
      stopDemo()
      isOn = true
      await show($, 'idle', true)
      return { text: '小人已開啟：依情境在 待機／思考／工作／開心／出錯／休息 間切換。' }
    }

    return { text: '用法：/chibi on、/chibi off、/chibi demo 或 /chibi set owl|book' }
  })

  // 只看事件，不讀提問文字
  on('prompt.submit', async ($, e, next) => {
    hadError = false
    await show($, 'thinking')

    return next(e)
  })
    .catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    await show($, 'working')
    const ran = await next(e)
    const isFailed = ran.deny !== undefined || ran.isError === true
    hadError = hadError || isFailed
    await show($, isFailed ? 'error' : 'working')

    return ran
  })
    .catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await show($, hadError ? 'idle' : 'happy')

    return next(e)
  })
    .catch(($, e, next) => next(e))

  on('turn.abort', async ($, e, next) => {
    await show($, 'idle')

    return next(e)
  })
    .catch(($, e, next) => next(e))

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)

    const parsed = parseScene(e.props.scene)
    if (parsed === undefined) return next(e)

    const { Svg } = $.ui.resolve(e)

    return <Svg source={sceneFor(parsed.set, parsed.state)} alt={`右下角的 Q 版小人（${parsed.state}）`} isInteractive />
  })
}
