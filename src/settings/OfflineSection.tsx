import { useEffect, useState } from 'react'
import { loadMaterialAudio, loadWordAudio } from '../speech/clips'

const RUNTIME = 'eigo-app-runtime'

/** アプリに内蔵した音声ファイル（聞き分けの録音・素材の朗読）の一覧 */
async function builtInAudio(): Promise<string[]> {
  const files = new Set<string>()
  for (const list of Object.values(await loadWordAudio())) for (const c of list) files.add(c.file)
  for (const m of Object.values(await loadMaterialAudio())) for (const f of Object.values(m.clips)) files.add(f)
  return [...files].map((f) => new URL(`${import.meta.env.BASE_URL}audio/${f}`, location.href).href)
}

/**
 * オフラインの準備（フェーズ7）。
 * 画面と教材は入れたときに端末に保存される。内蔵の音声は聞いたときに保存されるが、ここでまとめて保存もできる。
 */
export function OfflineSection() {
  const [state, setState] = useState<{ shell: boolean; audio: number; total: number } | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null)

  const check = async () => {
    if (!('caches' in window)) { setState({ shell: false, audio: 0, total: 0 }); return }
    const keys = await caches.keys()
    const shell = keys.some((k) => k.startsWith('eigo-app-shell-'))
    const urls = await builtInAudio()
    const cache = await caches.open(RUNTIME)
    const saved = new Set((await cache.keys()).map((r) => r.url))
    setState({ shell, audio: urls.filter((u) => saved.has(u)).length, total: urls.length })
  }
  useEffect(() => { void check() }, [])

  const saveAll = async () => {
    const urls = await builtInAudio()
    const cache = await caches.open(RUNTIME)
    const saved = new Set((await cache.keys()).map((r) => r.url))
    const todo = urls.filter((u) => !saved.has(u))
    let done = 0
    let failed = 0
    setProgress({ done, total: todo.length, failed })
    // 4つずつ取得する（一度に頼みすぎない）
    for (let i = 0; i < todo.length; i += 4) {
      await Promise.all(todo.slice(i, i + 4).map(async (u) => {
        try {
          const res = await fetch(u)
          if (res.ok) await cache.put(u, res)
          else failed++
        } catch { failed++ }
        done++
      }))
      setProgress({ done, total: todo.length, failed })
    }
    await check()
  }

  const supported = 'serviceWorker' in navigator && 'caches' in window
  return (
    <section className="card stack">
      <h2>オフラインの準備</h2>
      {!supported ? (
        <p className="muted">この端末（ブラウザ）は、オフラインでの保存に対応していません。</p>
      ) : !state ? (
        <p className="muted">確かめています…</p>
      ) : (
        <>
          <p>
            画面と教材：<strong>{state.shell ? '端末に保存済み' : 'まだ保存されていません（一度通信できる所で開き直すと保存されます）'}</strong><br />
            内蔵の音声（聞き分けの録音・素材の朗読）：<strong className="num">{state.audio} / {state.total}</strong> 個
          </p>
          <p className="muted">
            通信できない所でも、復習・多聴多読・作文などの練習と記録はできます。
            PC で作った音声は、一度聞いたものだけが使えます（まだのものは端末の声で読みます）。
            Claude への依頼と、音声認識の準備（初回だけ）は通信が必要です。
          </p>
          {state.audio < state.total && !progress && (
            <button className="btn secondary block" onClick={() => void saveAll()}>内蔵の音声をまとめて保存する（約35MB）</button>
          )}
          {progress && (
            <p className="banner info">
              保存中… <span className="num">{progress.done} / {progress.total}</span>
              {progress.failed > 0 && `（失敗 ${progress.failed}。通信できる所でもう一度押してください）`}
              {progress.done === progress.total && ' 完了しました。'}
            </p>
          )}
        </>
      )}
    </section>
  )
}
