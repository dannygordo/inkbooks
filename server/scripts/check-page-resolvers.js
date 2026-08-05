// Every query declared to return a *Page must actually build one. A schema that BUILDS and a
// resolver that RETURNS THE RIGHT SHAPE are independent facts - which is exactly how seventeen
// tests got past a clean "SCHEMA OK". This reads the resolver source, since withAuth wraps the
// function and hides its body from toString().
const fs = require('fs');
const path = require('path');

const schemaSrc = require('../graphql/typeDefs').loc.source.body;
const pageFields = new Set(
  [...schemaSrc.matchAll(/^\s*(\w+)(?:\([^)]*\))?\s*:\s*\w+Page!?\s*$/gm)].map((m) => m[1]),
);

const dir = path.join(__dirname, '..', 'graphql', 'resolvers');
let bad = 0;
const seen = new Set();

for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const field of pageFields) {
    const start = src.indexOf(`${field}: withAuth(`);
    if (start === -1) continue;
    seen.add(field);
    // Slice to the next top-level resolver declaration, or end of file.
    const rest = src.slice(start);
    const nextDecl = rest.slice(1).search(/\n {4}\w+: withAuth\(/);
    const body = nextDecl === -1 ? rest : rest.slice(0, nextDecl);

    const builds = /paginate\(|paginateArray\(|pageInfo:/.test(body);
    const bareArray = /return \[\];/.test(body);
    const ok = builds && !bareArray;
    if (!ok) bad++;
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'} ${field.padEnd(26)} ${file.padEnd(18)}` +
        `${builds ? '' : ' does not build a page'}${bareArray ? ' returns a bare []' : ''}`,
    );
  }
}

for (const field of pageFields) {
  if (!seen.has(field)) {
    bad++;
    console.log(`  FAIL ${field.padEnd(26)} - declared as a Page but no resolver found`);
  }
}

console.log(bad ? `\n${bad} resolver(s) disagree with the schema` : '\nEvery *Page query builds a page');
process.exit(bad ? 1 : 0);
