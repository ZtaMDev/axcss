#!/usr/bin/env node

import { program } from 'commander';
import { build } from '../src/commands/build.js';
import { startDev } from '../src/commands/dev.js'; // <-- Importamos el watcher

program
  .version('1.0.0')
  .description('AXCSS Compiler - A CSS component compiler');

// Comando build normal
program
  .command('build')
  .description('Build all .axcss files')
  .action(build);

// Comando dev / watch
program
  .command('dev')
  .description('Watch .axcss files and rebuild on changes')
  .action(startDev);

program.parse(process.argv);
