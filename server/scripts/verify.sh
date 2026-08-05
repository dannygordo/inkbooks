#!/usr/bin/env bash
# Everything that can be checked without a database or a browser.
#
# Written down because a green run of these is NOT the same as a passing test suite, and I kept
# treating it as though it were. It catches syntax, imports, schema construction and query
# validity. It cannot catch a resolver returning the wrong shape, a React hook used without its
# provider, or an assertion that's simply wrong.
#
#   cd server && ./scripts/verify.sh
#
# Then, always, both suites:
#   cd server && npm test
#   cd client && npm test        <- forgotten for most of a day; the client has 19 test files
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== syntax"
for f in graphql/resolvers/*.js graphql/mutations/*.js utils/*.js scripts/*.js models/*.js \
         test/integration/*.js test/helpers/*.js index.js; do node --check "$f"; done
echo "   ok"

echo "== modules load, schema builds"
node -e "
const fs=require('fs');
for(const d of ['graphql/resolvers','graphql/mutations'])
  for(const f of fs.readdirSync(d)) if(f.endsWith('.js')) require('./'+d+'/'+f);
const {ApolloServer}=require('@apollo/server');
new ApolloServer({typeDefs:require('./graphql/typeDefs'),resolvers:require('./graphql/resolvers')})
  .start().then(()=>console.log('   ok')).catch(e=>{console.error(e.message);process.exit(1);});
"

echo "== every *Page query actually builds a page"
node scripts/check-page-resolvers.js | tail -1

echo "== GraphQL documents validate against the schema"
node -e "
const {validate,parse}=require('graphql');
const {makeExecutableSchema}=require('@graphql-tools/schema');
const {DateTypeDefs}=require('graphql-scalars');
const schema=makeExecutableSchema({typeDefs:[require('./graphql/typeDefs'),DateTypeDefs],resolvers:require('./graphql/resolvers')});
const fs=require('fs'),path=require('path');
let n=0,bad=0;
let files=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.(js|jsx)$/.test(e.name))files.push(p);}})('../client/src');
for(const f of files){const src=fs.readFileSync(f,'utf8');
 for(const m of src.matchAll(/gql\`([\s\S]*?)\`/g)){if(m[1].includes('\${'))continue;n++;
  try{const e=validate(schema,parse(m[1]));if(e.length){bad++;console.error('   INVALID',f,e[0].message);}}catch(err){bad++;console.error('   PARSE',f);}}}
for(const f of fs.readdirSync('test/integration')){if(!f.endsWith('.test.js'))continue;
 const src=fs.readFileSync('test/integration/'+f,'utf8');
 for(const m of src.matchAll(/[\`']\s*((?:query|mutation|\{)[\s\S]*?)[\`']/g)){
  const d=m[1].trim(); if(!/^(query|mutation|\{)/.test(d))continue; n++;
  try{const e=validate(schema,parse(d));if(e.length){bad++;console.error('   INVALID',f,e[0].message);}}catch(err){}}}
if(bad){process.exit(1);} console.log('   ok ('+n+' documents)');
"

echo "== no backticks inside typeDefs.js, which is a JS template literal"
if awk 'NR>3 && /\`/ && !/^\`;$/' graphql/typeDefs.js | grep -q .; then
  echo "   FAIL - a backtick in a GraphQL comment ends the template literal"; exit 1
fi
echo "   ok"

echo
echo "Static checks pass. This is not a test run - now run both suites."
