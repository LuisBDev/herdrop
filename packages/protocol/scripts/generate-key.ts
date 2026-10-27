import { generateExtensionKey } from '../src/extension-id.ts';

console.log(JSON.stringify(await generateExtensionKey(), null, 2));
