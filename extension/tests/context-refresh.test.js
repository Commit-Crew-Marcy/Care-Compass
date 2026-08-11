const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')


test('every question refreshes page context before contacting the backend', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.js'), 'utf8')
  const refreshIndex = source.indexOf('const currentPageContext = await refreshPageContext()')
  const requestIndex = source.indexOf("type: 'CARE_COMPASS_ASK_GEMINI'", refreshIndex)

  assert.ok(refreshIndex >= 0)
  assert.ok(requestIndex > refreshIndex)
  assert.match(source.slice(refreshIndex, requestIndex + 250), /pageContext: currentPageContext/)
})


test('page capture prioritizes visible dialogs and their controls', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8')

  assert.match(source, /collectVisibleDialogs\(\)/)
  assert.match(source, /helpers\.prepareContextText/)
  assert.match(source, /\.\.\.dialogHeadings/)
  assert.match(source, /\.\.\.dialogElements/)
})


test('reinjection after an extension reload replaces the stale message receiver', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8')

  assert.doesNotMatch(source, /if \(globalThis\.__CARE_COMPASS_CONTENT_SCRIPT__\) return/)
  assert.match(source, /__CARE_COMPASS_MESSAGE_HANDLER__/)
  assert.match(source, /onMessage\.removeListener\(previousHandler\)/)
  assert.match(source, /onMessage\.addListener\(handleCareCompassMessage\)/)
})


test('reload-time popup promises are handled', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.js'), 'utf8')

  assert.match(source, /initialize\(\)\.catch/)
  assert.match(source, /try \{\s+await executeAction\(action, true\)/)
})
