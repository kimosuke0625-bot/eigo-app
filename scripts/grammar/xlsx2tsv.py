# CEFR-J Grammar Profile の Excel（CEFRJGP_FULL_20250225.xlsx）の各シートを TSV に書き出す（標準ライブラリのみ。PC の作業用）。
#   python -I scripts/grammar/xlsx2tsv.py "<xlsx>" "%USERPROFILE%/eigo-data/ref/cefrj/tsv"   → 00.tsv が項目一覧（ITEM LIST）、13.tsv が教員版
import sys, zipfile, re, os
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
z = zipfile.ZipFile(src)
shared = []
if 'xl/sharedStrings.xml' in z.namelist():
    for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
        shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
wb = ET.fromstring(z.read('xl/workbook.xml'))
rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
target = {r.get('Id'): r.get('Target') for r in rels}
def col(ref):
    n = 0
    for ch in re.match(r'[A-Z]+', ref).group():
        n = n * 26 + ord(ch) - 64
    return n - 1
for i, sh in enumerate(wb.find('m:sheets', NS)):
    name = sh.get('name')
    path = 'xl/' + target[sh.get('{%s}id' % NS['r'])].lstrip('/').replace('xl/', '')
    root = ET.fromstring(z.read(path))
    rows = []
    for row in root.iter('{%s}row' % NS['m']):
        cells = {}
        for c in row.findall('m:c', NS):
            v = c.find('m:v', NS)
            t = c.get('t')
            if t == 's' and v is not None:
                val = shared[int(v.text)]
            elif t == 'inlineStr':
                val = ''.join(x.text or '' for x in c.iter('{%s}t' % NS['m']))
            else:
                val = v.text if v is not None else ''
            cells[col(c.get('r'))] = (val or '').replace('\t', ' ').replace('\n', ' / ')
        if cells:
            rows.append('\t'.join(cells.get(k, '') for k in range(max(cells) + 1)))
    fn = os.path.join(out, f'{i:02d}.tsv')
    with open(fn, 'w', encoding='utf-8') as f:
        f.write('\n'.join(rows))
    print(i, name, len(rows), fn)
