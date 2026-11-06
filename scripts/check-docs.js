#!/usr/bin/env node
// Verifica a estrutura da documentação: cada pasta relevante deve ter README.md
// com as seções padrão, e os dois documentos globais devem existir.
// Uso: npm run docs:check
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const REQUIRED_SECTIONS = [
    'Objetivo do Módulo',
    'Responsabilidade Principal',
    'Dependências Internas e Externas',
    'Módulos Relacionados',
    'Pontos de Entrada',
    'Observações Técnicas e Débitos Identificados',
];
// Seções exigidas apenas em módulos com implementação própria (não em agregadores)
const MODULE_SECTIONS = ['Funcionalidades Existentes', 'Fluxos Importantes', 'Arquivos Críticos'];
const AGGREGATORS = [path.join('src', 'modules')];
const GLOBAL_DOCS = ['docs/ARQUITETURA-DO-SISTEMA.md', 'docs/OBJETIVO-DO-SISTEMA.md'];

// Pastas relevantes: prisma/, subpastas de src/ e subpastas de src/modules/
const dirs = ['prisma'];
for (const base of ['src', path.join('src', 'modules')]) {
    for (const e of fs.readdirSync(path.join(root, base), { withFileTypes: true })) {
        if (e.isDirectory() && !['generated'].includes(e.name)) dirs.push(path.join(base, e.name));
    }
}
dirs.push(path.join('src', 'modules'));

const errors = [];
for (const d of new Set(dirs)) {
    const file = path.join(root, d, 'README.md');
    if (!fs.existsSync(file)) { errors.push(`${d}: README.md ausente`); continue; }
    const text = fs.readFileSync(file, 'utf8');
    const required = AGGREGATORS.includes(d) ? REQUIRED_SECTIONS : [...REQUIRED_SECTIONS, ...MODULE_SECTIONS];
    for (const s of required) {
        if (!new RegExp(`^##\\s+${s}`, 'm').test(text)) errors.push(`${d}/README.md: seção "${s}" ausente`);
    }
}
for (const g of GLOBAL_DOCS) {
    if (!fs.existsSync(path.join(root, g))) errors.push(`${g}: documento global ausente`);
}

if (errors.length) {
    console.error('Documentação inconsistente:\n- ' + errors.join('\n- '));
    process.exit(1);
}
console.log('Documentação OK: READMEs e documentos globais conforme o padrão.');
