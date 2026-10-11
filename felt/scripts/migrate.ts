import { readFileSync } from 'node:fs';
import { sql } from './_shared';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
await sql.unsafe(schema);
console.log('schema applied');
await sql.end();
