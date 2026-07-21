'use strict'

const statusElement = document.querySelector('#status')
const allowedModes = new Set(['automatic', 'local', 'production'])

function selectMode(mode) {
  const safeMode = allowedModes.has(mode) ? mode : 'automatic'
  const input = document.querySelector(`input[name="api-mode"][value="${safeMode}"]`)
  document.querySelectorAll('label.option-selected').forEach((label) => {
    label.classList.remove('option-selected')
  })
  if (input) {
    input.checked = true
    input.closest('label')?.classList.add('option-selected')
  }
}

chrome.storage.local.get({ careCompassApiMode: 'automatic' }, ({ careCompassApiMode }) => {
  selectMode(careCompassApiMode)
})

document.querySelectorAll('input[name="api-mode"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked || !allowedModes.has(input.value)) return
    selectMode(input.value)
    chrome.storage.local.set({ careCompassApiMode: input.value }, () => {
      statusElement.textContent = 'Connection saved.'
    })
  })
})
