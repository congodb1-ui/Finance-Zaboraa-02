import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const isTsx = Boolean(
  process.env.__TSX_ACTIVE__ ||
  process.execArgv.some((arg) => arg.includes('tsx')) ||
  process.argv[0]?.includes('tsx') ||
  process.argv[1]?.includes('tsx')
);

if (!isTsx) {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: { ...process.env, __TSX_ACTIVE__: 'true' },
    }
  );

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
} else {
  const { runServer } = await import('./src/server-app.ts');
  runServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
