import { watch } from 'chokidar';
import { build } from './build.js';

let timeout;

export async function startDev() {
  console.log('Watching .axcss files for changes...');

  const watcher = watch('**/*.axcss', { ignored: ['node_modules/**', '.axcss/**'] });

  const scheduleBuild = () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(async () => {
      try {
        await build({ silent: true }); // Build silencioso
        console.log('✅ Build completed.');
      } catch (err) {
        console.error('❌ Build failed:', err.message);
      }
    }, 100); // Espera 100ms después del último cambio
  };

  watcher.on('add', scheduleBuild);
  watcher.on('change', scheduleBuild);
  watcher.on('unlink', scheduleBuild);
}
