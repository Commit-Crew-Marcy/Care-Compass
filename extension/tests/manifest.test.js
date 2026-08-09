const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('manifest uses temporary active-tab access instead of every-site access', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'))
  assert.equal(manifest.manifest_version, 3)
  assert.ok(manifest.permissions.includes('activeTab'))
  assert.ok(manifest.permissions.includes('scripting'))
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false)
  assert.equal(manifest.options_ui.page, 'options/options.html')
  assert.ok(manifest.content_scripts[0].matches.includes('http://localhost/*'))
  assert.ok(manifest.content_scripts[0].matches.includes('http://127.0.0.1/*'))
})

test('the guide is docked as a side panel, not a popup that closes on an outside click', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'))
  assert.ok(manifest.permissions.includes('sidePanel'))
  assert.equal(manifest.side_panel.default_path, 'popup/popup.html')
  assert.equal(manifest.action.default_popup, undefined)
})
