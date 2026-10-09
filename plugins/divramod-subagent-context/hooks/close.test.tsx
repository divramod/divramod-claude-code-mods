import { expect, test } from 'claude-code/testing'

import { isClose } from './grid'
import { mounted } from './testkit'

test('q closes the pane, other keys and ctrl+q do not', async ($, on) => {
  const closed: string[] = []
  on('ui.close', async (_$, e, next) => {
    closed.push(e.id)
    return next(e)
  })
  const { ui } = await mounted($, on)
  await ui.key({ key: 'r', in: 'table' })
  await ui.key({ key: 'q', ctrl: true, in: 'table' })
  expect(closed).toEqual([])
  await ui.key({ key: 'q', in: 'table' })
  expect(closed).toEqual(['subagent-context'])
})

test('only a close request is a close', () => {
  expect(isClose({ close: true })).toBe(true)
  expect(isClose({ close: 1 })).toBe(false)
  expect(isClose(null)).toBe(false)
})

test('the close button has the hotkey q and closes the pane when pressed', async ($, on) => {
  const closed: string[] = []
  on('ui.close', (_$, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  const { ui } = await mounted($, on)
  expect((await ui.find({ type: 'Button', key: 'close' }))?.props.hotkey).toBe('q')
  await ui.press({ key: 'close' })
  expect(closed).toEqual(['subagent-context'])
})
