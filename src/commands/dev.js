import { watch } from 'chokidar';
import { build } from './build.js';
import { logger } from '../utils/colors.js';
let timeout;

export async function startDev() {
  logger.info('Watching .axcss files for changes...');

  const watcher = watch('**/*.axcss', { ignored: ['node_modules/**', '.axcss/**'] });

  const scheduleBuild = () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(async () => {
      try {
        await build({ silent: false }); // Build silencioso
        logger.info('Waiting for changes...');
      } catch (err) {
        logger.error('Build failed:', err.message);
        
      }
    }, 100); // Espera 100ms después del último cambio
  };

  watcher.on('add', scheduleBuild);
  watcher.on('change', scheduleBuild);
  watcher.on('unlink', scheduleBuild);
}
