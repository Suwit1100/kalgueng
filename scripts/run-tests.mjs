import { rmSync, writeFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('../', import.meta.url))
const outDir = join(cwd, '.test-dist')
rmSync(outDir, { recursive: true, force: true })

function run(command, args) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const tsc = process.platform === 'win32' ? 'node_modules/.bin/tsc.cmd' : 'node_modules/.bin/tsc'
run(tsc, ['-p', 'tsconfig.test.json'])
writeFileSync(join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }))

const unitTests = readdirSync(join(outDir, 'src/lib')).filter((name) => name.endsWith('.test.js')).map((name) => join(outDir, 'src/lib', name))
run(process.execPath, ['--test', ...unitTests])

const serverTests = readdirSync(join(cwd, 'server')).filter((name) => name.endsWith('.test.js')).map((name) => join(cwd, 'server', name))
run(process.execPath, ['--test', ...serverTests])
rmSync(outDir, { recursive: true, force: true })
