// componentProcessor.js
import { promises as fs } from 'fs';
import { logger } from '../utils/colors.js';

// ----------------- Helpers -----------------
const isWhitespace = (ch) => /\s/.test(ch);
const escapeForRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function stripCssComments(cssContent) {
  // Elimina todos los /* ... */ incluyendo multilínea
  return cssContent.replace(/\/\*[\s\S]*?\*\//g, '').trim();
}

import path from 'path';

// ----------------- IMPORTS: regex y utilidad para quitar @import del CSS final -----------------
const IMPORT_REGEX = /@import\s+['"]([^'"]+)['"]\s*;?/g;

export function stripImportStatements(content) {
  if (!content) return '';
  // elimina todas las líneas que empiecen por @import
  return content.replace(/^\s*@import[^\n]*$/gmi, '').trim();
}


/**
 * Carga recursivamente definiciones `component` desde filePath y sus imports.
 * Devuelve Map<componentName, componentDef>.
 * - visited previene ciclos.
 * - Si un componente local tiene el mismo nombre que uno importado, el local sobrescribe.
 */
async function loadComponentsFromFile(filePath, visited = new Set()) {
  const components = new Map();
  const absPath = path.resolve(filePath);

  visited.add(absPath);

  let content;
  try {
    content = await fs.readFile(absPath, 'utf8');
  } catch (err) {
    logger.warning(`Import file not found: ${filePath} (${absPath}) — skipping import.`);
    return components;
  }

  // Resolver imports recursivamente
  let m;
  IMPORT_REGEX.lastIndex = 0;
  while ((m = IMPORT_REGEX.exec(content)) !== null) {
    let importPath = m[1].trim();
    if (!importPath.endsWith('.axcss')) importPath += '.axcss';
    const resolved = path.resolve(path.dirname(absPath), importPath);
    const importedMap = await loadComponentsFromFile(resolved, visited);
    for (const [name, def] of importedMap) {
      if (!components.has(name)) components.set(name, def);
    }
  }

  // Parsear componentes del archivo actual y añadir (sobrescriben imports)
  try {
    const defs = parseComponentDefinition(content);
    for (const def of defs) {
      def.__source = absPath; // metadata opcional
      components.set(def.name, def);
    }
  } catch (err) {
    console.warn(`⚠️ Failed parsing components from ${absPath}: ${err.message}`);
  }

  return components;
}

// Extrae un bloque balanceado { ... } empezando en startIndex (donde debe haber '{')
function extractBlock(content, startIndex) {
  if (content[startIndex] !== '{') return { block: null, end: startIndex };
  let depth = 0;
  let i = startIndex;
  for (; i < content.length; i++) {
    const ch = content[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return { block: content.slice(startIndex + 1, i), end: i + 1 };
      }
    }
  }
  return { block: null, end: content.length };
}

function cleanBlockString(s) {
  return s.replace(/^\s+|\s+$/g, '');
}
// ----------------- Parse parameters (soporta ':' y '=') -----------------
function parseParamList(paramsStr) {
    if (!paramsStr || !paramsStr.trim()) return [];
    return paramsStr.split(',').map(p => {
      const raw = p.trim();
      if (!raw) return null;
  
      // soportar tanto 'name = default' como 'name: default'
      let name, defaultValue;
      if (raw.includes('=')) {
        const parts = raw.split('=');
        name = parts[0].trim().replace(/^\$/, '');
        defaultValue = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      } else if (raw.includes(':')) {
        const parts = raw.split(':');
        name = parts[0].trim().replace(/^\$/, '');
        defaultValue = parts.slice(1).join(':').trim().replace(/^['"]|['"]$/g, '');
      } else {
        name = raw.replace(/^\$/, '');
        defaultValue = undefined;
      }
  
      return { name, defaultValue };
    }).filter(Boolean);
  }
  
  // ----------------- Construir mapa de props efectivas (instance override defaults) -----------------
  function buildMergedProps(componentParams, instanceProps, componentName, instanceName) {
    const merged = {};
    for (const param of componentParams) {
      const name = param.name;
      if (instanceProps && Object.prototype.hasOwnProperty.call(instanceProps, name)) {
        merged[name] = instanceProps[name];
      } else if (param.defaultValue !== undefined) {
        merged[name] = param.defaultValue;
      } else {
        // Si no hay value en instancia ni default en componente -> error
        logger.error(`Default value not defined for $${name} in instance ${componentName}.${instanceName}`);
      }
    }
    return merged;
  }
// ----------------- Parse component definitions -----------------
export function parseComponentDefinition(content) {
  const components = [];
  const headerRegex = /component\s+([a-zA-Z][a-zA-Z0-9_\-]*)\s*\(([^)]*)\)\s*/g;
  let match;
  while ((match = headerRegex.exec(content)) !== null) {
    const name = match[1];
    const paramsStr = match[2];
    const braceIndex = content.indexOf('{', headerRegex.lastIndex);
    if (braceIndex === -1) continue;
    const { block, end } = extractBlock(content, braceIndex);
    if (block === null) continue;
    const body = cleanBlockString(block);
    const params = parseParamList(paramsStr);
    components.push({ name, params, body });
    headerRegex.lastIndex = end;
  }
  return components;
}

// ----------------- Parse component instances -----------------
export function parseComponentInstances(content) {
  const instances = [];
  const instRegex = /([a-zA-Z][a-zA-Z0-9_\-]*)\.([a-zA-Z][a-zA-Z0-9_\-]*)\s*/g;
  let match;
  while ((match = instRegex.exec(content)) !== null) {
    const componentName = match[1];
    const instanceName = match[2];
    const braceIndex = content.indexOf('{', instRegex.lastIndex);
    if (braceIndex === -1) continue;
    const { block, end } = extractBlock(content, braceIndex);
    if (block === null) continue;
    const instanceBody = cleanBlockString(block);
    // parse props: $name: value;
    const props = {};
    const propRegex = /\$([a-zA-Z0-9_\-]+)\s*:\s*([^;]+);?/g;
    let pMatch;
    while ((pMatch = propRegex.exec(instanceBody)) !== null) {
      props[pMatch[1]] = pMatch[2].trim().replace(/^['"]|['"]$/g, '');
    }
    instances.push({ componentName, instanceName, props, rawBody: instanceBody });
    instRegex.lastIndex = end;
  }
  return instances;
}

// ----------------- Strip component and instance blocks (preserve plain CSS) -----------------
export function stripComponentAndInstanceBlocks(content) {
  const ranges = [];

  // encontrar componentes
  const headerRegex = /component\s+([a-zA-Z][a-zA-Z0-9_\-]*)\s*\(([^)]*)\)\s*/g;
  let match;
  while ((match = headerRegex.exec(content)) !== null) {
    const start = match.index;
    const braceIndex = content.indexOf('{', headerRegex.lastIndex);
    if (braceIndex === -1) continue;
    const { end } = extractBlock(content, braceIndex);
    ranges.push([start, end]);
    headerRegex.lastIndex = end;
  }

  // encontrar instancias
  const instRegex = /([a-zA-Z][a-zA-Z0-9_\-]*)\.([a-zA-Z][a-zA-Z0-9_\-]*)\s*/g;
  while ((match = instRegex.exec(content)) !== null) {
    const start = match.index;
    const braceIndex = content.indexOf('{', instRegex.lastIndex);
    if (braceIndex === -1) continue;
    const { end } = extractBlock(content, braceIndex);
    ranges.push([start, end]);
    instRegex.lastIndex = end;
  }

  if (ranges.length === 0) return content;
  // ordenar desc por start y cortar
  ranges.sort((a, b) => b[0] - a[0]);
  let remaining = content;
  for (const [s, e] of ranges) remaining = remaining.slice(0, s) + remaining.slice(e);
  return remaining.trim();
}

// ----------------- When conditions -----------------
function processWhenConditions(body, props) {
  const whenHeaderRegex = /when\s+\$([a-zA-Z0-9_\-]+)\s*(==|!=)\s*([^\s{]+)\s*/g;
  let out = '';
  let cursor = 0;
  let match;

  while ((match = whenHeaderRegex.exec(body)) !== null) {
    const start = match.index;
    out += body.slice(cursor, start);
    const varName = match[1];
    const operator = match[2];
    let rawValue = match[3].trim().replace(/^['"]|['"]$/g, '');
    const bracePos = body.indexOf('{', whenHeaderRegex.lastIndex);
    if (bracePos === -1) {
      cursor = whenHeaderRegex.lastIndex;
      continue;
    }
    const { block, end } = extractBlock(body, bracePos);
    const instanceVal = props[varName];
    let cond = false;
    if (operator === '==') cond = String(instanceVal) === rawValue;
    if (operator === '!=') cond = String(instanceVal) !== rawValue;
    if (cond) out += block;
    cursor = end;
    whenHeaderRegex.lastIndex = end;
  }
  out += body.slice(cursor);
  return out;
}

// ----------------- Variables (reemplaza usando mergedProps) -----------------
function processVariables(body, mergedProps) {
    let processed = body;
  
    // Reemplaza todas las variables definidas en mergedProps (una sola pasada por variable)
    for (const [key, value] of Object.entries(mergedProps)) {
      const regex = new RegExp(escapeForRegex(`$${key}`) + `(?![a-zA-Z0-9_-])`, 'g');
      processed = processed.replace(regex, value);
    }
  
    // Si quedan $unknown, borrarlos (o podrías lanzar advertencia)
    processed = processed.replace(/\$([a-zA-Z0-9_-]+)/g, '');
  
    return processed;
  }
// ----------------- Simple AST builder y generador -----------------
function buildAst(body) {
  const root = { selector: null, rules: [], children: [] };
  let i = 0;
  const len = body.length;

  while (i < len) {
    while (i < len && isWhitespace(body[i])) i++;
    if (i >= len) break;
    const nextBrace = body.indexOf('{', i);
    const nextSemicolon = body.indexOf(';', i);

    if (nextSemicolon !== -1 && (nextSemicolon < nextBrace || nextBrace === -1)) {
      const rule = body.slice(i, nextSemicolon).trim();
      if (rule) root.rules.push(rule + ';');
      i = nextSemicolon + 1;
      continue;
    }

    if (nextBrace === -1) {
      const remainder = body.slice(i).trim();
      if (remainder) {
        const rules = remainder.split(';').map(r => r.trim()).filter(Boolean);
        for (const r of rules) root.rules.push(r + ';');
      }
      break;
    }

    const selector = body.slice(i, nextBrace).trim();
    const { block, end } = extractBlock(body, nextBrace);
    const innerAst = buildAst(block);
    const node = { selector: selector, rules: innerAst.rules, children: innerAst.children };
    root.children.push(node);
    i = end;
  }
  return root;
}

function generateCssFromAst(ast, className) {
  const lines = [];

  function combineSelectors(parentSelectors, selector) {
    const parts = selector.split(',').map(s => s.trim()).filter(Boolean);
    const result = [];
    for (const pSel of parentSelectors) {
      for (const part of parts) {
        if (part.includes('&')) result.push(part.replace(/&/g, pSel));
        else if (part.startsWith(':')) result.push(`${pSel}${part}`);
        else if (part.startsWith('>')) result.push(`${pSel} ${part}`);
        else if (part.startsWith('[')) result.push(`${pSel}${part}`);
        else if (part.startsWith('.') || part.startsWith('#')) result.push(`${pSel} ${part}`);
        else result.push(`${pSel} ${part}`);
      }
    }
    return result;
  }

  if (ast.rules && ast.rules.length) {
    lines.push(`.${className} {`);
    for (const r of ast.rules) lines.push(`  ${r}`);
    lines.push(`}`);
  }

  function emitNode(node, parentSelectors) {
    const sel = (node.selector || '').trim();
    const finalSelectors = sel ? combineSelectors(parentSelectors, sel) : parentSelectors;

    if (node.rules && node.rules.length) {
      lines.push(`${finalSelectors.join(', ')} {`);
      for (const r of node.rules) lines.push(`  ${r}`);
      lines.push(`}`);
    }

    if (node.children && node.children.length) {
      for (const child of node.children) emitNode(child, finalSelectors);
    }
  }

  for (const child of ast.children) emitNode(child, [`.${className}`]);
  return lines.join('\n\n');
}

export function processComponentInstance(component, instance, className) {
    // 1) Construir mergedProps (instance override defaults). Esto valida defaults faltantes.
    const mergedProps = buildMergedProps(component.params, instance.props || {}, component.name, instance.instanceName);
  
    // 2) Evaluar bloques `when` usando mergedProps
    let body = processWhenConditions(component.body, mergedProps);
  
    // 3) Reemplazar variables usando mergedProps
    body = processVariables(body, mergedProps);
  
    // 4) Parsear y generar CSS
    const ast = buildAst(body);
    const css = generateCssFromAst(ast, className);
    return css.trim();
  }
  
// ----------------- Error manager / analyzer -----------------
function indexToLineCol(text, index) {
    const lines = text.slice(0, index).split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    return { line, column: col };
  }
  
  function scanBraces(content) {
    const stack = [];
    const unmatchedCloses = [];
    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (ch === '{') stack.push(i);
      if (ch === '}') {
        if (stack.length === 0) unmatchedCloses.push(i);
        else stack.pop();
      }
    }
    // remaining stack are unmatched opens
    return { unmatchedOpens: stack.slice(), unmatchedCloses };
  }
  
  export function analyzeContent(content) {
    const issues = [];
  
    // 1) Braces check
    const { unmatchedOpens, unmatchedCloses } = scanBraces(content);
    for (const idx of unmatchedCloses) {
      const pos = indexToLineCol(content, idx);
      issues.push({
        severity: 'error',
        message: `Unmatched closing '}' at line ${pos.line}, column ${pos.column}.`,
        line: pos.line,
        column: pos.column,
        suggestion: "Remove the extra '}' or add the matching opening '{'."
      });
    }
    for (const idx of unmatchedOpens) {
      const pos = indexToLineCol(content, idx);
      issues.push({
        severity: 'error',
        message: `Unclosed block starting at line ${pos.line}, column ${pos.column} (missing '}' ).`,
        line: pos.line,
        column: pos.column,
        suggestion: "Add a closing '}' for the opened block."
      });
    }
  
    // 2) component header basic validation (missing ')' or '{')
    const compKeywordRegex = /component\b/g;
    let m;
    while ((m = compKeywordRegex.exec(content)) !== null) {
      const start = m.index;
      const parenOpen = content.indexOf('(', start);
      const braceOpen = content.indexOf('{', start);
      if (parenOpen === -1 || parenOpen > braceOpen) {
        const pos = indexToLineCol(content, start);
        issues.push({
          severity: 'error',
          message: "Malformed component header: missing parameter list `(...)` before `{`.",
          line: pos.line,
          column: pos.column,
          suggestion: "Ensure you wrote: component Name($a: default, ...) { ... }"
        });
        continue;
      }
      const parenClose = content.indexOf(')', parenOpen);
      if (parenClose === -1 || parenClose > braceOpen) {
        const pos = indexToLineCol(content, parenOpen);
        issues.push({
          severity: 'error',
          message: "Malformed component header: missing closing `)` for parameter list.",
          line: pos.line,
          column: pos.column,
          suggestion: "Close the parameter list with `)` before the component body."
        });
      }
    }
  
    // 3) parse components and instances
    let components = [];
    try {
      components = parseComponentDefinition(content) || [];
    } catch (e) {
      // If parser completely fails, report and bail
      issues.push({ severity: 'error', message: `Failed parsing components: ${e.message}`, line: 1, column: 1 });
      return issues;
    }
  
    const instances = parseComponentInstances(content) || [];
  
    // 4) Per-component checks
    for (const comp of components) {
      // duplicate params
      const seen = new Set();
      for (const p of comp.params) {
        if (seen.has(p.name)) {
          // find approximate index of param in the header for line col
          const headerIndex = content.indexOf(`component ${comp.name}`);
          const pos = indexToLineCol(content, headerIndex >= 0 ? headerIndex : 0);
          issues.push({
            severity: 'error',
            message: `Duplicate parameter '${p.name}' in component ${comp.name}.`,
            line: pos.line,
            column: pos.column,
            suggestion: `Remove or rename duplicate parameter '${p.name}'.`
          });
        }
        seen.add(p.name);
      }
  
      // variables used in body but not declared
      const varRegex = /\$([a-zA-Z0-9_-]+)/g;
      const used = new Set();
      let vm;
      while ((vm = varRegex.exec(comp.body)) !== null) used.add(vm[1]);
      for (const u of used) {
        if (!comp.params.some(p => p.name === u)) {
          // warn (maybe it's a global or mistake)
          const idx = comp.body.indexOf(`$${u}`);
          const pos = indexToLineCol(content, content.indexOf(comp.body) + (idx >= 0 ? idx : 0));
          issues.push({
            severity: 'warning',
            message: `Variable '$${u}' used in component '${comp.name}' but not declared as parameter.`,
            line: pos.line,
            column: pos.column,
            suggestion: `Declare $${u} in the component parameters or remove its usage.`
          });
        }
      }
  
      // when checks: ensure when var exists
      const whenHeaderRegex = /when\s+\$([a-zA-Z0-9_-]+)\s*(==|!=)\s*([^\s{]+)/g;
      let wh;
      while ((wh = whenHeaderRegex.exec(comp.body)) !== null) {
        const varName = wh[1];
        if (!comp.params.some(p => p.name === varName)) {
          const pos = indexToLineCol(content, content.indexOf(comp.body) + wh.index);
          issues.push({
            severity: 'error',
            message: `when condition references unknown variable '$${varName}' in component '${comp.name}'.`,
            line: pos.line,
            column: pos.column,
            suggestion: `Either declare $${varName} in the component or fix the condition.`
          });
        }
      }
  
      // parse body AST and validate rules (prop: value;)
      let ast;
      try {
        ast = buildAst(comp.body);
      } catch (e) {
        const pos = indexToLineCol(content, content.indexOf(comp.body));
        issues.push({ severity: 'error', message: `Failed building AST for component ${comp.name}: ${e.message}`, line: pos.line, column: pos.column });
        continue;
      }
      // check rules with empty value
      const checkRules = (node, baseIndex) => {
        if (node.rules && node.rules.length) {
          for (const rule of node.rules) {
            // rule is like 'background: $color;'
            const ruleTrim = rule.trim();
            // skip if not contain ':'
            if (!ruleTrim.includes(':')) {
              const pos = indexToLineCol(content, content.indexOf(comp.body) + (comp.body.indexOf(ruleTrim) >= 0 ? comp.body.indexOf(ruleTrim) : 0));
              issues.push({
                severity: 'error',
                message: `Malformed CSS rule '${ruleTrim}' in component '${comp.name}'.`,
                line: pos.line,
                column: pos.column,
                suggestion: 'Ensure rule format: property: value;'
              });
              continue;
            }
            const parts = ruleTrim.split(':');
            const prop = parts[0].trim();
            const valAndSemi = parts.slice(1).join(':').trim();
            // remove trailing ;
            const val = valAndSemi.replace(/;$/, '').trim();
            if (!val) {
              const pos = indexToLineCol(content, content.indexOf(comp.body) + (comp.body.indexOf(ruleTrim) >= 0 ? comp.body.indexOf(ruleTrim) : 0));
              issues.push({
                severity: 'error',
                message: `Empty value for property '${prop}' in component '${comp.name}'.`,
                line: pos.line,
                column: pos.column,
                suggestion: `Provide a value or a default for variable used in '${prop}'.`
              });
            }
          }
        }
        if (node.children) {
          for (const child of node.children) checkRules(child, baseIndex);
        }
      };
      if (ast) {
        checkRules(ast);
      }
    }
  
    // 5) Instances checks
    for (const inst of instances) {
        const comp = components.find(c => c.name === inst.componentName);
    
        // Si no hay componentes en el archivo, asumimos que es CSS plano y no reportamos instancias desconocidas.
        if (!comp) {
        if (!components || components.length === 0) {
            // No hay componentes definidos en este archivo -> saltarnos esta comprobación.
            continue;
        }
    
        const pos = indexToLineCol(content, content.indexOf(inst.rawBody));
        issues.push({
            severity: 'error',
            message: `Instance refers to unknown component '${inst.componentName}'.`,
            line: pos.line,
            column: pos.column,
            suggestion: `Ensure component '${inst.componentName}' is defined before instantiating it.`
        });
        continue;
        }
    
        // instance props not in component params -> warning
        for (const propName of Object.keys(inst.props)) {
        if (!comp.params.some(p => p.name === propName)) {
            const idx = inst.rawBody.indexOf(`$${propName}`);
            const pos = indexToLineCol(content, content.indexOf(inst.rawBody) + (idx >= 0 ? idx : 0));
            issues.push({
            severity: 'warning',
            message: `Instance '${inst.componentName}.${inst.instanceName}' defines unknown prop '$${propName}'.`,
            line: pos.line,
            column: pos.column,
            suggestion: `Remove or declare '$${propName}' in the component parameters.`
            });
        }
    }
  }
  
    // Sort issues: errors first, then warnings, by line
    issues.sort((a, b) => {
      const sev = (x) => (x.severity === 'error' ? 0 : 1);
      if (sev(a) !== sev(b)) return sev(a) - sev(b);
      return (a.line || 0) - (b.line || 0) || (a.column || 0) - (b.column || 0);
    });
  
    return issues;
  }

// Limpieza / normalización final del CSS para evitar líneas en blanco repetidas
export function normalizeCss(css) {
  if (!css) return '';

  // 1) normalizar saltos de línea a \n
  let out = css.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2) quitar comentarios redundantes que puedan quedar (por si acaso)
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');

  // 3) quitar espacios finales de cada línea
  out = out.split('\n').map(line => line.replace(/[ \t]+$/g, '')).join('\n');

  // 4) eliminar líneas en blanco repetidas: colapsar 3+ saltos -> 2 saltos máximo
  out = out.replace(/\n{3,}/g, '\n\n');

  // 5) quitar líneas vacías inmediatamente después de "{" y antes de "}"
  out = out.replace(/\{\s*\n+/g, '{\n');    // "{\n\n  ..." -> "{\n  ..."
  out = out.replace(/\n+\s*\}/g, '\n}');    // "...\n\n}" -> "...\n}"

  // 6) quitar líneas vacías entre reglas dentro de bloques (ej: "prop;\n\n  prop2;")
  out = out.replace(/;\n\s*\n\s*/g, ';\n  ');

  // 7) asegurar que haya exactamente una línea en blanco entre bloques
  out = out.replace(/\}\n\s*\n\s*\./g, '}\n\n.'); // edge-case: "}\n\n\n.klass" => "}\n\n.klass"

  // 8) trim final y asegurar single trailing newline
  out = out.trim();
  return out ? out + '\n' : '';
}

async function resolveImportsRecursively(content, baseDir, visited = new Set()) {
  let result = content;
  let match;

  while ((match = IMPORT_REGEX.exec(result)) !== null) {
    let importPath = match[1].trim();
    if (!importPath.endsWith('.axcss')) importPath += '.axcss';
    const fullPath = path.resolve(baseDir, importPath);

    if (visited.has(fullPath)) {
      result = result.replace(match[0], '');
      continue;
    }
    visited.add(fullPath);

    let importedContent = '';
    try {
      importedContent = await fs.readFile(fullPath, 'utf8');
      importedContent = await resolveImportsRecursively(importedContent, path.dirname(fullPath), visited);
    } catch (e) {
      logger.warning(` Failed to import "${importPath}": ${e.message}`);
      importedContent = ''; // <--- importante, reemplaza el @import por vacío
    }

    result = result.replace(match[0], importedContent || '');
  }

  return result;
}


// ----------------- Process file (AHORA conserva CSS normal) -----------------
export async function processFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');

    // 0) Analyzer (igual que antes)
    const issues = analyzeContent(content);
    const fatal = issues.filter(i => i.severity === 'error');
    if (fatal.length) {
      const messages = fatal.map(f => `${f.message} (line ${f.line}:${f.column})`).join('\n');
      throw new Error(`Syntax errors found:\n${messages}`);
    } else {
      for (const w of issues.filter(i => i.severity === 'warning')) {
        logger.warning(`${w.message} (line ${w.line}:${w.column})`);
      }
    }

    // 1) obtener CSS "normal" (todo lo que no sea componente ni instancia)
    let plainCSS = stripComponentAndInstanceBlocks(content);

    // 1.a) quitar directivas @import del CSS plano (evita errors en PostCSS)
    plainCSS = stripImportStatements(plainCSS);

    // 1.b) Limpiar comentarios y normalizar
    plainCSS = stripCssComments(plainCSS);
    plainCSS = normalizeCss(plainCSS);

    // 2) Resolver imports y reunir TODAS las definiciones de componentes (importadas + locales)
    // 0) Leer contenido y resolver imports antes de parsear
    const rawContent = await fs.readFile(filePath, 'utf8');
    const resolvedContent = await resolveImportsRecursively(rawContent, path.dirname(filePath));

    // Ahora parseamos componentes desde todo el contenido (incluye imports)
    const components = new Map();
    for (const def of parseComponentDefinition(resolvedContent)) {
      components.set(def.name, def);
    }


    // 3) parsear instancias del archivo actual
    const instances = parseComponentInstances(resolvedContent);

    let generatedCSS = '';
    const usedClassNames = new Set();

    for (const instance of instances) {
      const component = components.get(instance.componentName);
      if (!component) {
        logger.warning(` Component "${instance.componentName}" not found for instance "${instance.instanceName}" in ${filePath} — skipping.`);
        continue;
      }

      let base = instance.instanceName.toLowerCase();
      let unique = base;
      let counter = 1;
      while (usedClassNames.has(unique)) unique = `${base}-${counter++}`;
      usedClassNames.add(unique);

      // generar CSS para la instancia
      let instanceCSS = processComponentInstance(component, instance, unique);

      // limpiar y normalizar CSS generado
      instanceCSS = stripCssComments(instanceCSS);
      instanceCSS = normalizeCss(instanceCSS);

      if (instanceCSS) {
        generatedCSS += `/* Instance: ${instance.componentName}.${instance.instanceName} */\n${instanceCSS}\n`;
      } else {
        logger.warning(` Generated CSS empty for ${component.name}.${instance.instanceName} — check variables / when conditions.`);
      }
    }

    // 4) combinar y eliminar imports remanentes (si quedasen)
    let combined = [plainCSS, generatedCSS].filter(Boolean).join('\n\n');
    combined = stripImportStatements(combined);  // quita @import sobrantes
    const final = normalizeCss(combined);


    return final;

  } catch (err) {
    logger.error(`Error processing file ${filePath}:`, err);
    throw err;
  }
}


// ----------------- Convenience -----------------
export async function processContentString(content) {
  const plainCSS = stripComponentAndInstanceBlocks(content);
  const componentDefs = parseComponentDefinition(content);
  const components = new Map();
  for (const def of componentDefs) components.set(def.name, def);
  const instances = parseComponentInstances(content);
  let generatedCSS = '';
  const usedClassNames = new Set();

  for (const instance of instances) {
    const component = components.get(instance.componentName);
    if (!component) {
      logger.warning(`No component in \"${instance.componentName}\" this is an simple css syntax it doesn't have axcss syntax`);
      continue;
    }
    let base = instance.instanceName.toLowerCase();
    let unique = base;
    let counter = 1;
    while (usedClassNames.has(unique)) unique = `${base}-${counter++}`;
    usedClassNames.add(unique);

    const instanceCSS = processComponentInstance(component, instance, unique);
    generatedCSS += `/* Instance: ${instance.componentName}.${instance.instanceName} */\n${instanceCSS}\n\n`;
  }

  const final = [plainCSS.trim(), generatedCSS.trim()].filter(Boolean).join('\n\n');
  return final;
}
