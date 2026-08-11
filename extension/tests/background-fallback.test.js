const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const helpers = require('../shared.js')


test('automatic mode sends external-page questions directly to the local backend', async () => {
  const requestedUrls = []
  const context = vm.createContext({
    AbortController,
    CareCompassExtension: helpers,
    clearTimeout,
    console,
    importScripts: () => {},
    setTimeout,
    fetch: async (url) => {
      requestedUrls.push(url)
      return {
        ok: true,
        status: 200,
        json: async () => ({ message: 'Local guide answer', action: null }),
      }
    },
    chrome: {
      action: { onClicked: { addListener: () => {} } },
      runtime: {
        onMessage: { addListener: () => {} },
        sendMessage: async () => {},
      },
      sidePanel: { open: async () => {} },
      storage: {
        local: {
          get: (_defaults, callback) => callback({ careCompassApiMode: 'automatic' }),
        },
      },
    },
  })
  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8')
  vm.runInContext(source, context)

  const result = await vm.runInContext(`askGemini({
    question: 'Explain this page.',
    pageContext: {
      url: 'https://www.healthcare.gov/',
      domain: 'www.healthcare.gov',
      pageTitle: 'HealthCare.gov',
      pageText: 'Compare health coverage.',
      interactiveElements: []
    },
    responseMode: 'simple',
    history: []
  })`, context)

  assert.equal(result.ok, true)
  assert.equal(result.data.message, 'Local guide answer')
  assert.deepEqual(requestedUrls, [
    'http://localhost:8000/api/ai/extension/chat',
  ])
})
