// オフラインで使うための Service Worker（フェーズ7）。ビルドのときに vite.config.ts が dist/sw.js として書き出す。
// __VERSION__ と __PRECACHE__ はビルドのときに置き換わる。
// - 画面（index.html・JS・CSS）と教材データ（data/*.json）は、入れたときに端末に保存する
// - 書体も入れたときに保存する。内蔵の音声・音声認識のエンジンは、使ったときに保存する（設定から音声をまとめて保存もできる）
// - 学習データは IndexedDB にあり、ここでは扱わない。どこにも送らない
const VERSION = '__VERSION__'
const SHELL = `eigo-app-shell-${VERSION}`
const RUNTIME = 'eigo-app-runtime'
const PRECACHE = __PRECACHE__

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL)
    // 1つ失敗しても残りは保存する（通信が途切れた場合など）
    await Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('eigo-app-shell-') && key !== SHELL) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

const scope = new URL(self.registration.scope)

async function fromCache(request) {
  return (await caches.match(request, { ignoreSearch: true, ignoreVary: true })) ?? undefined
}

/** 通信を先に試し、だめなら保存したもの（画面・音声の一覧） */
async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request)
    if (res.ok) (await caches.open(cacheName)).put(request, res.clone())
    return res
  } catch {
    const hit = await fromCache(request)
    if (hit) return hit
    throw new Error('offline')
  }
}

/** 保存したものを先に使い、なければ取得して保存（名前に版の入った JS・CSS・書体・音声） */
async function cacheFirst(request) {
  const hit = await fromCache(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) (await caches.open(RUNTIME)).put(request, res.clone())
  return res
}

/** 音声の一部分の要求に、保存した音声から切り出して答える（なければ全体を取得して保存してから） */
async function rangeFromCache(request) {
  let full = await fromCache(request)
  if (!full) {
    try {
      const res = await fetch(request.url)
      if (!res.ok) return res
      await (await caches.open(RUNTIME)).put(request.url, res.clone())
      full = res
    } catch {
      return fetch(request)
    }
  }
  const blob = await full.blob()
  const m = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '')
  const start = m && m[1] ? Number(m[1]) : 0
  const end = m && m[2] ? Math.min(Number(m[2]), blob.size - 1) : blob.size - 1
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': full.headers.get('Content-Type') ?? 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${blob.size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  })
}

/** 保存したものをすぐ使い、裏で新しくする（教材データ） */
async function staleWhileRevalidate(request) {
  const hit = await fromCache(request)
  const update = fetch(request).then(async (res) => {
    if (res.ok) (await caches.open(SHELL)).put(request, res.clone())
    return res
  }).catch(() => undefined)
  return hit ?? (await update) ?? Response.error()
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== scope.origin) return

  // 画面を開く：新しい版を優先し、オフラインなら保存した画面
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, SHELL).catch(async () => (await caches.match(new URL('./', scope).href)) ?? (await caches.match(new URL('./index.html', scope).href)) ?? Response.error()))
    return
  }
  // PC で作った音声の一覧（音声そのものはアプリが自分で保存している）
  if (url.pathname.endsWith('/eigo-audio/index.json')) {
    event.respondWith(networkFirst(req, RUNTIME))
    return
  }
  if (!url.href.startsWith(scope.href)) return
  const path = url.href.slice(scope.href.length)
  if (path.startsWith('data/')) { event.respondWith(staleWhileRevalidate(req)); return }
  if (path.startsWith('assets/') || path.startsWith('audio/')) {
    // iPhone は音声を少しずつ（Range）読みに来るので、保存したものから切り出して返す
    event.respondWith(req.headers.has('range') ? rangeFromCache(req) : cacheFirst(req))
    return
  }
  event.respondWith(staleWhileRevalidate(req))
})
