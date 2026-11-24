// Laptop / projector screen (index.html).
// Big QR code that sends phones to phone.html.
//
// Where the QR points:
//   1. index.html?url=https://example.com/phone.html → that exact address (override)
//   2. Otherwise → phone.html on this same site (e.g. your-site.netlify.app/phone.html)

import QRCode from 'qrcode'
import { config } from '../config.js'

function getPlayUrl() {
  const override = new URLSearchParams(window.location.search).get('url')
  if (override) return override
  const url = new URL('phone.html', window.location.href)
  url.search = ''
  url.hash = ''
  return url.href
}

async function mountDisplay(container) {
  const url = getPlayUrl()
  const isLocal = ['localhost', '127.0.0.1'].includes(new URL(url).hostname)

  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: config.ink, light: config.bg },
  })

  container.innerHTML = `
    <div class="display-inner">
      <div class="display-text">
        <p class="display-title">Find someone.</p>
        <p class="display-body">
          Scan with your phone.<br>
          You will be paired with a stranger<br>
          somewhere in this room.
        </p>
        <p class="display-url"></p>
        ${isLocal ? `<p class="display-url">This is a local test address. Phones can't open it. Use the Netlify site for phones.</p>` : ''}
      </div>
      <div class="display-qr">${svg}</div>
    </div>
  `
  container.querySelector('.display-url').textContent = url.replace(/^https?:\/\//, '')
}

mountDisplay(document.getElementById('display'))
