const test = require('node:test');
const assert = require('node:assert/strict');
const { compare } = require('./frontend-lint.cjs');
const legacy = {file:'src/legacy.tsx',ruleId:'react-refresh/only-export-components',message:'legacy issue',line:4,column:1,severity:2};
test('only identical legacy findings are accepted',()=>{
 assert.equal(compare([legacy],[legacy]).length,0);
 assert.equal(compare([legacy],[]).length,0);
 assert.equal(compare([], [legacy]).length,1);
 assert.equal(compare([legacy],[{...legacy,message:'new issue'}]).length,1);
 assert.equal(compare([legacy],[{...legacy,file:'src/new.tsx'}]).length,1);
 assert.equal(compare([legacy],[{...legacy,fatal:true}]).length,1);
});
