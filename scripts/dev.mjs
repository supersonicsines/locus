// Runs the host and the Studio together, with hot reload for the Studio.
import { spawn } from 'node:child_process'

const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })

const host = run('node', ['--experimental-strip-types', '--no-warnings', 'src/cli/index.ts', 'serve', '--data', '.locus-data', '--studio', 'dist/studio'])
const studio = run('npx', ['vite'])

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    host.kill()
    studio.kill()
    process.exit(0)
  })
}
