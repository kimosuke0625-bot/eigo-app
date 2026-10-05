import { useLiveQuery } from 'dexie-react-hooks'
import { db, type EigoDB, type Example, type Item, type ItemEdit } from '../db/schema'

/** 例文を見分けるキー。Tatoeba の文は文番号、自作の例文は英文そのもの */
export function exampleKey(ex: Example): string {
  return ex.enId ? `t${ex.enId}` : `o:${ex.en}`
}

/** 利用者が直した訳と、差し替えた例文を反映した語 */
export function applyEdit(item: Item, edit: ItemEdit | undefined): Item {
  if (!edit) return item
  const hidden = new Set(edit.hiddenExamples)
  return {
    ...item,
    japanese: edit.ja ?? item.japanese,
    examples: item.examples.filter((ex) => !hidden.has(exampleKey(ex))),
  }
}

export function useEdited(item: Item): Item {
  const edit = useLiveQuery(() => db.edits.get(item.id), [item.id])
  return applyEdit(item, edit)
}

async function patch(itemId: string, change: (e: ItemEdit) => ItemEdit, database: EigoDB) {
  await database.transaction('rw', database.edits, async () => {
    const current = (await database.edits.get(itemId)) ?? { itemId, hiddenExamples: [], at: 0 }
    await database.edits.put({ ...change(current), at: Date.now() })
  })
}

/** 日本語訳を書き直す。空にすると元の訳に戻す */
export function saveGloss(itemId: string, ja: string, database: EigoDB = db) {
  const text = ja.trim()
  return patch(itemId, (e) => ({ ...e, ja: text || undefined }), database)
}

/** 意訳などで使いたくない例文を外す。控えの例文が繰り上がって表示される */
export function hideExample(itemId: string, ex: Example, database: EigoDB = db) {
  return patch(itemId, (e) => ({ ...e, hiddenExamples: [...new Set([...e.hiddenExamples, exampleKey(ex)])] }), database)
}

export function restoreExamples(itemId: string, database: EigoDB = db) {
  return patch(itemId, (e) => ({ ...e, hiddenExamples: [] }), database)
}
