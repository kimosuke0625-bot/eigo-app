// テストとビルドを通してから、dist の中身を gh-pages ブランチに上書きで送る
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })
const remote = execSync('git remote get-url origin').toString().trim()

run('npm test')
run('npm run build')
writeFileSync('dist/.nojekyll', '')
run('git init -q -b gh-pages', 'dist')
run('git add -A', 'dist')
run('git -c user.name=kimosuke0625-bot -c user.email=kimosuke0625-bot@users.noreply.github.com commit -q -m "公開"', 'dist')
run(`git push -f -q ${remote} gh-pages`, 'dist')
console.log('公開しました：https://kimosuke0625-bot.github.io/eigo-app/')
