import { SPRITES as BOOK } from './sprites-book'
import { SPRITES as OWL } from './sprites-owl'

// 兩組圖：owl 為原創；book 的授權見 NOTICE.md。scale 讓兩組角色看起來一樣大
export const SETS = {
  owl: { sprites: OWL, scale: 2.0 },
  book: { sprites: BOOK, scale: 2.2 },
}

export type SetName = keyof typeof SETS
export type State = keyof typeof OWL

const FOOT = 900 - 125
const PREFIX = 'chibi-'

export function isSetName(value: unknown): value is SetName {
  return typeof value === 'string' && value in SETS
}

export function sceneName(set: SetName, state: State): string {
  return `${PREFIX}${set}-${state}`
}

export function parseScene(scene: string): { set: SetName; state: State } | undefined {
  if (!scene.startsWith(PREFIX)) return undefined
  const [set, state] = scene.slice(PREFIX.length).split('-')
  if (!isSetName(set) || state === undefined || !(state in SETS[set].sprites)) return undefined

  return { set, state: state as State }
}

// 透明背景 + 右下角像素立繪（root 用 xMaxYMax slice，右下永遠保留）
export function sceneFor(set: SetName, state: State): string {
  const { sprites, scale } = SETS[set]
  const s = sprites[state]
  const x = 1600 - s.w * scale - 40
  const y = FOOT - s.h * scale

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMaxYMax slice">
<style>@media (min-aspect-ratio:2/1){#spr{transform:scale(.75);transform-origin:1600px 900px}}</style>
<g id="spr"><g transform="translate(${x} ${y}) scale(${scale})" shape-rendering="crispEdges">${s.paths}</g></g>
</svg>`
}
