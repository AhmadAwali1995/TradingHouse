import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vite'

const candleDir = path.resolve(fileURLToPath(new URL('../TradingHouseBE/candle-history/candles/', import.meta.url)))
const candleFiles = new Set([
  'BTCUSDT.json',
  'ETHUSDT.json',
  'SOLUSDT.json',
  'BNBUSDT.json',
  'LINKUSDT.json',
  'AVAXUSDT.json',
  'QNTUSDT.json',
  'XRPUSDT.json',
  'EURUSDT.json',
])

function serveTestCandles(request: IncomingMessage, response: ServerResponse, next: Connect.NextFunction) {
  const name = decodeURIComponent((request.url ?? '').split('?')[0].replace(/^\//, ''))
  if (!candleFiles.has(name)) {
    next()
    return
  }
  const file = path.resolve(candleDir, name)
  if (!file.startsWith(candleDir) || !fs.existsSync(file)) {
    next()
    return
  }
  response.setHeader('Content-Type', 'application/json')
  fs.createReadStream(file).pipe(response)
}

function testCandlesPlugin(): Plugin {
  return {
    name: 'test-candles',
    configureServer(server) {
      server.middlewares.use('/test-candles', serveTestCandles)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/test-candles', serveTestCandles)
    },
  }
}

export default defineConfig({
  plugins: [react(), testCandlesPlugin()],
})
