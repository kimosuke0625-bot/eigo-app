// オフラインで使うための Service Worker（フェーズ7）。ビルドのときに vite.config.ts が dist/sw.js として書き出す。
// __VERSION__ と __PRECACHE__ はビルドのときに置き換わる。
// - 画面（index.html・JS・CSS）と教材データ（data/*.json）は、入れたときに端末に保存する
// - 書体も入れたときに保存する。内蔵の音声・音声認識のエンジンは、使ったときに保存する（設定から音声をまとめて保存もできる）
// - 学習データは IndexedDB にあり、ここでは扱わない。どこにも送らない
const VERSION = '82d92d326f2f'
const SHELL = `eigo-app-shell-${VERSION}`
const RUNTIME = 'eigo-app-runtime'
const PRECACHE = ["./","./assets/dotgothic16-10-400-normal-XBm6YP3Q.woff2","./assets/dotgothic16-100-400-normal-C5cPANc4.woff2","./assets/dotgothic16-101-400-normal-NoKQQoJs.woff2","./assets/dotgothic16-102-400-normal-DW2RuSjB.woff2","./assets/dotgothic16-103-400-normal-BB8xiwuw.woff2","./assets/dotgothic16-104-400-normal-wV6xEcPU.woff2","./assets/dotgothic16-105-400-normal-n1-uyjvz.woff2","./assets/dotgothic16-106-400-normal-BFmhmkOi.woff2","./assets/dotgothic16-107-400-normal-_0P37778.woff2","./assets/dotgothic16-108-400-normal-CGPl0O4A.woff2","./assets/dotgothic16-109-400-normal-DNUUP1eJ.woff2","./assets/dotgothic16-11-400-normal-C5zLcBMS.woff2","./assets/dotgothic16-110-400-normal-ChAwD9Ce.woff2","./assets/dotgothic16-111-400-normal-xJkwhyOg.woff2","./assets/dotgothic16-112-400-normal-DBQmMkJU.woff2","./assets/dotgothic16-113-400-normal-Db_mJ9ZX.woff2","./assets/dotgothic16-114-400-normal-Ch6ldd1t.woff2","./assets/dotgothic16-115-400-normal-D8cRvKlf.woff2","./assets/dotgothic16-116-400-normal-C1LzDmGn.woff2","./assets/dotgothic16-117-400-normal-DQFWJrKE.woff2","./assets/dotgothic16-118-400-normal-BkcH-j0o.woff2","./assets/dotgothic16-119-400-normal-CqOxGV82.woff2","./assets/dotgothic16-12-400-normal-ktXtUDZG.woff2","./assets/dotgothic16-13-400-normal-DU19P-j7.woff2","./assets/dotgothic16-14-400-normal-C7WZ2svY.woff2","./assets/dotgothic16-15-400-normal-D2_e2n1W.woff2","./assets/dotgothic16-16-400-normal-DRoxv7y3.woff2","./assets/dotgothic16-17-400-normal-DG2QyB2w.woff2","./assets/dotgothic16-18-400-normal-K9MKKTr8.woff2","./assets/dotgothic16-19-400-normal-CXwThgld.woff2","./assets/dotgothic16-20-400-normal-BDMMHx9_.woff2","./assets/dotgothic16-21-400-normal-nmkcTX2N.woff2","./assets/dotgothic16-22-400-normal-5Td3eOG5.woff2","./assets/dotgothic16-23-400-normal-CYGxt2Pc.woff2","./assets/dotgothic16-24-400-normal-CZOfGULC.woff2","./assets/dotgothic16-25-400-normal-5jKLIoAD.woff2","./assets/dotgothic16-26-400-normal-hFMhUtEr.woff2","./assets/dotgothic16-27-400-normal-D1aTxIFo.woff2","./assets/dotgothic16-28-400-normal-CfIcqNxF.woff2","./assets/dotgothic16-29-400-normal-BZ4N8lkp.woff2","./assets/dotgothic16-3-400-normal-CqmRfGJf.woff2","./assets/dotgothic16-30-400-normal-BZQi52gO.woff2","./assets/dotgothic16-31-400-normal-Ceq9lyc6.woff2","./assets/dotgothic16-32-400-normal-DoUiChor.woff2","./assets/dotgothic16-33-400-normal-DIDR44KW.woff2","./assets/dotgothic16-34-400-normal-h6RA-2pn.woff2","./assets/dotgothic16-35-400-normal-nRcmIhX7.woff2","./assets/dotgothic16-36-400-normal-CHEeH6ZD.woff2","./assets/dotgothic16-37-400-normal-O3lkKp8G.woff2","./assets/dotgothic16-38-400-normal-B-uoQnWv.woff2","./assets/dotgothic16-39-400-normal-DM2y8kCE.woff2","./assets/dotgothic16-40-400-normal-iVh_8Ltj.woff2","./assets/dotgothic16-41-400-normal-BmLOgN0H.woff2","./assets/dotgothic16-42-400-normal-C3v6WOYV.woff2","./assets/dotgothic16-43-400-normal-2Y73Euw4.woff2","./assets/dotgothic16-44-400-normal-B8s0g1CJ.woff2","./assets/dotgothic16-45-400-normal-BjCmhJhi.woff2","./assets/dotgothic16-46-400-normal-XHZ2gdg3.woff2","./assets/dotgothic16-47-400-normal-CHQGrR_9.woff2","./assets/dotgothic16-48-400-normal-CqIJ7KSA.woff2","./assets/dotgothic16-49-400-normal-BSB5vq6Y.woff2","./assets/dotgothic16-5-400-normal-DcLOHINF.woff2","./assets/dotgothic16-50-400-normal-BxypR0FB.woff2","./assets/dotgothic16-52-400-normal-uRiD0-6V.woff2","./assets/dotgothic16-53-400-normal-CJrr4ygV.woff2","./assets/dotgothic16-55-400-normal-CLC2FF7Y.woff2","./assets/dotgothic16-56-400-normal-D3lK7zqi.woff2","./assets/dotgothic16-58-400-normal-CFGod8TT.woff2","./assets/dotgothic16-59-400-normal-AsnEgYmn.woff2","./assets/dotgothic16-6-400-normal-CNBXTab_.woff2","./assets/dotgothic16-60-400-normal-BHnhbBuy.woff2","./assets/dotgothic16-61-400-normal-B_IHLeTD.woff2","./assets/dotgothic16-62-400-normal-BhCjUHWL.woff2","./assets/dotgothic16-63-400-normal-CHg9wxsM.woff2","./assets/dotgothic16-64-400-normal-ClKxCdyX.woff2","./assets/dotgothic16-65-400-normal-D_GnWqJJ.woff2","./assets/dotgothic16-66-400-normal-DAMFP0lv.woff2","./assets/dotgothic16-67-400-normal-DCliEpQW.woff2","./assets/dotgothic16-68-400-normal-65QWZhA-.woff2","./assets/dotgothic16-69-400-normal-eRTRzsdB.woff2","./assets/dotgothic16-7-400-normal-Bk4Efuv8.woff2","./assets/dotgothic16-70-400-normal-DM4CUgYQ.woff2","./assets/dotgothic16-71-400-normal-vcYDuTxI.woff2","./assets/dotgothic16-72-400-normal-CHi7HsYu.woff2","./assets/dotgothic16-73-400-normal-BgRN-8ow.woff2","./assets/dotgothic16-74-400-normal-CoK5YXBi.woff2","./assets/dotgothic16-75-400-normal-CaMzlAkb.woff2","./assets/dotgothic16-76-400-normal-Ck8YW26d.woff2","./assets/dotgothic16-77-400-normal-CaZufTzo.woff2","./assets/dotgothic16-78-400-normal-DuR3Kr_F.woff2","./assets/dotgothic16-79-400-normal-efwO7zCi.woff2","./assets/dotgothic16-8-400-normal-Dy8g_nGf.woff2","./assets/dotgothic16-80-400-normal-BOT0TY1Q.woff2","./assets/dotgothic16-81-400-normal-BtpOFxJC.woff2","./assets/dotgothic16-82-400-normal-DQve92VA.woff2","./assets/dotgothic16-83-400-normal-CYXwLB98.woff2","./assets/dotgothic16-84-400-normal-C_7eQxWI.woff2","./assets/dotgothic16-85-400-normal-Dmkw0Tgb.woff2","./assets/dotgothic16-86-400-normal-Ox_TTTlT.woff2","./assets/dotgothic16-87-400-normal-9GSTkPjv.woff2","./assets/dotgothic16-88-400-normal-Db1m1tpZ.woff2","./assets/dotgothic16-89-400-normal-rU2gDHqi.woff2","./assets/dotgothic16-9-400-normal-QetsSX0O.woff2","./assets/dotgothic16-90-400-normal-DD6GgtoL.woff2","./assets/dotgothic16-91-400-normal-BnA8XDdi.woff2","./assets/dotgothic16-92-400-normal-CK-lDa6s.woff2","./assets/dotgothic16-93-400-normal-ATYSzQz8.woff2","./assets/dotgothic16-94-400-normal-Cb03lgz5.woff2","./assets/dotgothic16-95-400-normal-Co2tYRHr.woff2","./assets/dotgothic16-96-400-normal-sZfX4m2-.woff2","./assets/dotgothic16-97-400-normal-XJjcBjL2.woff2","./assets/dotgothic16-98-400-normal-Da_y6Dai.woff2","./assets/dotgothic16-99-400-normal-Cv_yrxHh.woff2","./assets/dotgothic16-latin-400-normal-BYJEY5oh.woff2","./assets/index-Bn48ciNi.css","./assets/index-xZJy5qfG.js","./assets/whisper.worker-C_pHN3GC.js","./data/bsl.json","./data/facts.json","./data/grammar.json","./data/idioms.json","./data/material-audio.json","./data/materials.json","./data/ngsl.json","./data/quotes.json","./data/word-audio.json","./favicon.svg","./index.html","./manifest.webmanifest"]

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
  // PC で作った音声（同じサイトの eigo-audio）。アプリが端末に保存したものを、オフラインでも返す
  if (url.pathname.includes('/eigo-audio/') && url.pathname.endsWith('.mp3')) {
    event.respondWith(req.headers.has('range') ? rangeFromCache(req) : cacheFirst(req))
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
