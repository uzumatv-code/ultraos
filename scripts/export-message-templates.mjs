// Gera server/message-template-data.json a partir de src/utils/message-template-definitions.ts.
// O servidor roda em Node sem TypeScript, então lê este JSON em vez do .ts.
// Rode `npm run sync:templates` sempre que os modelos padrão mudarem.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = pathToFileURL(path.join(root, 'src/utils/message-template-definitions.ts')).href;
const { MESSAGE_TEMPLATE_DEFINITIONS } = await import(source);
fs.writeFileSync(path.join(root, 'server/message-template-data.json'), `${JSON.stringify(MESSAGE_TEMPLATE_DEFINITIONS, null, 2)}\n`);
console.log(`${MESSAGE_TEMPLATE_DEFINITIONS.length} modelos exportados.`);
