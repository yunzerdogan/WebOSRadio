import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { IncomingMessage, ServerResponse } from 'node:http'

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 5

function isPrivateIpv4(address: string) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true
  const [first, second] = parts
  return first === 10
    || first === 127
    || first === 0
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || first >= 224
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase()
  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb')
    || normalized.startsWith('::ffff:127.')
    || normalized.startsWith('::ffff:10.')
    || normalized.startsWith('::ffff:192.168.')
}

async function validateTarget(target: URL) {
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Unsupported media protocol')
  if (target.username || target.password) throw new Error('Credentials in media URL are not allowed')
  if (target.hostname === 'localhost' || target.hostname.endsWith('.local')) throw new Error('Local targets are not allowed')

  const configuredHosts = process.env.ALLOWED_MEDIA_HOSTS
    ?.split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
  if (configuredHosts?.length && !configuredHosts.some((host) => target.hostname === host || target.hostname.endsWith(`.${host}`))) {
    throw new Error('Media host is not allowed')
  }

  if (isIP(target.hostname)) {
    if (isIP(target.hostname) === 4 ? isPrivateIpv4(target.hostname) : isPrivateIpv6(target.hostname)) {
      throw new Error('Private targets are not allowed')
    }
    return
  }

  const addresses = await lookup(target.hostname, { all: true })
  if (!addresses.length || addresses.some(({ address, family }) => family === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address))) {
    throw new Error('Media host resolves to a private address')
  }
}

async function fetchValidated(target: URL, headers: HeadersInit, signal: AbortSignal) {
  let currentTarget = target
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await validateTarget(currentTarget)
    const response = await fetch(currentTarget, { headers, redirect: 'manual', signal })
    if (!REDIRECT_CODES.has(response.status)) return response
    const location = response.headers.get('location')
    if (!location) throw new Error('Redirect without location')
    currentTarget = new URL(location, currentTarget)
  }
  throw new Error('Too many redirects')
}

function setCors(response: ServerResponse) {
  response.setHeader('Access-Control-Allow-Origin', process.env.PROXY_ALLOW_ORIGIN ?? '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type')
  response.setHeader('Access-Control-Expose-Headers', 'Content-Type, Content-Length, Content-Range, Accept-Ranges')
}

function getTarget(request: IncomingMessage) {
  const requestUrl = new URL(request.url ?? '', 'http://localhost')
  const targetValue = requestUrl.searchParams.get('url')
  if (!targetValue) throw new Error('Missing media URL')
  return new URL(targetValue)
}

async function handleStream(request: IncomingMessage, response: ServerResponse) {
  const target = getTarget(request)
  const abortController = new AbortController()
  request.on('aborted', () => abortController.abort())
  response.on('close', () => {
    if (!response.writableEnded) abortController.abort()
  })

  const upstream = await fetchValidated(target, {
    Accept: request.headers.accept ?? 'audio/mpeg,audio/aac,*/*',
    ...(request.headers.range ? { Range: request.headers.range } : {}),
    'User-Agent': 'WebOSRadio/1.0',
  }, abortController.signal)

  response.statusCode = upstream.status
  for (const header of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'icy-metaint',
    'icy-br',
  ]) {
    const value = upstream.headers.get(header)
    if (value) response.setHeader(header, value)
  }
  response.setHeader('Cache-Control', 'no-store')

  if (!upstream.body || request.method === 'HEAD') {
    response.end()
    return
  }

  const reader = upstream.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!response.write(value)) {
      await new Promise<void>((resolve) => response.once('drain', resolve))
    }
  }
  response.end()
}

async function handleMetadata(request: IncomingMessage, response: ServerResponse) {
  const target = getTarget(request)
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 10000)

  try {
    const upstream = await fetchValidated(target, {
      Accept: 'audio/mpeg,audio/aac,*/*',
      'Icy-MetaData': '1',
      'User-Agent': 'WebOSRadio/1.0',
    }, abortController.signal)
    const interval = Number(upstream.headers.get('icy-metaint'))
    if (!upstream.body || !Number.isFinite(interval) || interval <= 0) {
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ title: '', station: upstream.headers.get('icy-name') ?? '' }))
      return
    }

    const reader = upstream.body.getReader()
    let buffer = new Uint8Array()
    const requiredPrefix = interval + 1
    while (buffer.length < requiredPrefix) {
      const { done, value } = await reader.read()
      if (done) break
      const combined = new Uint8Array(buffer.length + value.length)
      combined.set(buffer)
      combined.set(value, buffer.length)
      buffer = combined
    }

    const metadataLength = (buffer[interval] ?? 0) * 16
    while (buffer.length < requiredPrefix + metadataLength) {
      const { done, value } = await reader.read()
      if (done) break
      const combined = new Uint8Array(buffer.length + value.length)
      combined.set(buffer)
      combined.set(value, buffer.length)
      buffer = combined
    }
    await reader.cancel()

    const metadata = new TextDecoder('utf-8')
      .decode(buffer.slice(requiredPrefix, requiredPrefix + metadataLength))
      .replace(/\0/g, '')
    const title = metadata.match(/StreamTitle='([^']*)'/i)?.[1] ?? ''
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end(JSON.stringify({
      title,
      station: upstream.headers.get('icy-name') ?? '',
    }))
  } finally {
    clearTimeout(timeout)
  }
}

export async function handleProxyRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  setCors(response)
  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    response.end()
    return true
  }

  const pathname = new URL(request.url ?? '', 'http://localhost').pathname
  if (pathname !== '/media-proxy' && pathname !== '/media-metadata') return false

  try {
    if (pathname === '/media-metadata') await handleMetadata(request, response)
    else await handleStream(request, response)
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error instanceof Error ? error : undefined)
      return true
    }
    response.statusCode = 502
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Proxy failed' }))
  }
  return true
}
