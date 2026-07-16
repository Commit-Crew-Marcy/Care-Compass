const test = require('node:test')
const assert = require('node:assert/strict')

const {
  isSafeClickDescriptor,
  isSupportedPageUrl,
  preparePageText,
  validateRequestedAction,
} = require('../shared.js')

test('only regular web pages are supported', () => {
  assert.equal(isSupportedPageUrl('https://benefits.gov/help'), true)
  assert.equal(isSupportedPageUrl('http://localhost:5173/results'), true)
  assert.equal(isSupportedPageUrl('chrome://extensions'), false)
  assert.equal(isSupportedPageUrl('file:///tmp/private.txt'), false)
})

test('page text is shortened and common sensitive values are removed', () => {
  const prepared = preparePageText(
    'Call 212-555-0188 or email person@example.com. SSN 123-45-6789.',
    200
  )
  assert.doesNotMatch(prepared, /212-555-0188/)
  assert.doesNotMatch(prepared, /person@example\.com/)
  assert.doesNotMatch(prepared, /123-45-6789/)
})

test('safe links can be clicked but application and form controls cannot', () => {
  assert.equal(isSafeClickDescriptor({
    tag: 'a', role: 'link', label: 'Learn about Medicare', href: '/medicare', inForm: false,
  }), true)
  assert.equal(isSafeClickDescriptor({
    tag: 'a', role: 'link', label: 'Apply now', href: '/apply', inForm: false,
  }), false)
  assert.equal(isSafeClickDescriptor({
    tag: 'button', role: 'button', label: 'Next', inForm: true,
  }), false)
})

test('actions must target a capability captured from the current page', () => {
  const elements = [{
    id: 'cc-element-1',
    label: 'Learn more',
    allowedActions: ['scroll', 'focus', 'click'],
  }]

  assert.deepEqual(
    validateRequestedAction({ type: 'scroll_to_element', target: 'cc-element-1' }, elements),
    { type: 'scroll_to_element', target: 'cc-element-1' }
  )
  assert.equal(
    validateRequestedAction({ type: 'click_element', target: 'cc-element-1' }, elements),
    null
  )
  assert.deepEqual(
    validateRequestedAction(
      { type: 'click_element', target: 'cc-element-1' },
      elements,
      { confirmed: true }
    ),
    { type: 'click_element', target: 'cc-element-1' }
  )
  assert.equal(
    validateRequestedAction({ type: 'submit_form', target: 'cc-element-1' }, elements),
    null
  )
})
