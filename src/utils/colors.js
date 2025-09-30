// Códigos de colores ANSI
export const colors = {
  // Estilos de texto
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  // Colores de texto
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  
  // Colores de fondo
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

// Funciones de utilidad para colorear
export const logger = {
  // Mensajes de éxito (verde)
  success: (message) => {
    console.log(`${colors.green}✓ ${message}${colors.reset}`);
  },
  
  // Mensajes de error (rojo)
  error: (message) => {
    console.error(`${colors.red}✗ ${message}${colors.reset}`);
  },
  
  // Advertencias (amarillo)
  warning: (message) => {
    console.warn(`${colors.yellow}⚠ ${message}${colors.reset}`);
  },
  
  // Información (azul)
  info: (message) => {
    console.log(`${colors.blue}ℹ ${message}${colors.reset}`);
  },
  
  // Mensajes de compilación (verde claro)
  compile: (message) => {
    console.log(`${colors.green}${colors.dim}→ ${message}${colors.reset}`);
  },
  
  // Mensajes de proxy (gris)
  proxy: (message) => {
    console.log(`${colors.gray}  ${message}${colors.reset}`);
  }
};

// Función para formatear rutas de archivo
export const formatPath = (path) => {
  return path.replace(/\\/g, '/');
};
