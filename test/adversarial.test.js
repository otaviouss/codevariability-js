"use strict";
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const assert=require("node:assert/strict");
const {createRequire}=require("node:module");
const {spawnSync}=require("node:child_process");
const load=createRequire(__filename);
const api=load("codevariability-js");
const sourceRoot=path.dirname(load.resolve("codevariability-js"));
const tree=load(path.join(sourceRoot,"ast-tree-edit.js"));
const root=fs.mkdtempSync(path.join(os.tmpdir(),"cv-audit-js-"));
const cases=[];
const checks=[];
let state=20261003;
const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
function check(name,run){
  try{const details=run();checks.push({name,status:"PASS",details});}
  catch(error){checks.push({name,status:"FAIL",error:error.message});}
}
function input(name,text){const p=path.join(root,name);fs.writeFileSync(p,text);return p;}
function matrixInvariant(result){
  for(const metric of result.metrics){const m=result.matrices[metric];
    for(let i=0;i<m.length;i++)for(let j=0;j<m.length;j++){
      assert.ok(Number.isFinite(m[i][j])&&m[i][j]>=0&&m[i][j]<=1);
      assert.equal(m[i][j],m[j][i]);if(i===j)assert.equal(m[i][j],1);
    }
  }
}
try{
  check("ordered tree distance: 200 independent-oracle cases",()=>{
    const data=JSON.parse(fs.readFileSync(path.join(__dirname,"tree-oracle-cases.json"),"utf8"));
    const node=v=>v===null?null:new tree.NormalizedAstNode(v.label,v.children.map(node));
    for(const item of data){
      const a=node(item.left),b=node(item.right);
      assert.equal(tree.treeEditDistance(a,b),item.distance);
      assert.equal(tree.treeEditDistance(b,a),item.distance);
      assert.ok(Math.abs(tree.treeEditSimilarity(a,b)-item.similarity)<1e-12);
    }
    return {pairs:data.length};
  });
  check("250 seeded source mutations: valid matrix or controlled parse error",()=>{
    const alphabet="xy012{}[]()<>+*=-;:'\"\\\n `";
    let accepted=0,rejected=0;
    for(let i=0;i<250;i++){
      let text="";for(let j=0,n=1+Math.floor(random()*100);j<n;j++)text+=alphabet[Math.floor(random()*alphabet.length)];
      const a=input("fuzz-a.js",text),b=input("fuzz-b.js",text);
      try{matrixInvariant(api.analyzeFiles([a,b],api.AST_METRICS));accepted++;}
      catch(error){assert.ok(error instanceof Error);assert.ok(!/Maximum call stack|heap out of memory/i.test(error.message));rejected++;}
    }
    return {seed:20261003,accepted,rejected};
  });
  check("150 valid programs: invariants and independent multiset baseline",()=>{
    for(let i=0;i<150;i++){
      const kind=random()<.5?"const":"let";
      const a=input("valid-a.js",`${kind} identifier${i} = ${i};`);
      const b=input("valid-b.ts",`${kind} other${i} = ${i+1};`);
      const result=api.analyzeFiles([a,b],api.AST_METRICS);matrixInvariant(result);
      assert.equal(result.matrices.ast_node_type_multiset_jaccard[0][1],1);
      assert.equal(result.matrices.ast_tree_edit_similarity[0][1],1);
    }
  });
  check("TypeScript angle-bracket assertion in .ts",()=>{
    matrixInvariant(api.analyzeFiles([input("valid.ts","const value = <number>source;")],"all"));
  });
  check("invalid UTF-8 is rejected rather than silently replaced",()=>{
    const p=input("invalid-utf8.js",Buffer.from([99,111,110,115,116,32,120,61,34,255,34,59]));
    assert.throws(()=>api.analyzeFiles([p],"all"));
  });
  check("Markdown prefix changes must remain in the parsed structure",()=>{
    const body="'use strict';\nconst a=1;\n'use strict';\nconst b=2;";
    const a=input("with-prefix.md","```js\nif(ready) run();\n"+body+"\n```");
    const b=input("without-prefix.md","```js\n"+body+"\n```");
    assert.ok(api.analyzeFiles([a,b],"all").matrix[0][1]<1);
  });
  check("directive-like text inside a template is valid source",()=>{
    const p=input("template.md","```js\nconst text = `\n'use strict';\nconst a=1;\n'use strict';\nconst b=2;\n`;\n```");
    matrixInvariant(api.analyzeFiles([p],"all"));
  });
  check("3 repeated analyses preserve exact JSON without cache",()=>{
    const a=input("tie-Ω.js","const x=1"),b=input("tie-a.ts","const y=2");
    const paths=[a,b];const prior=[...paths];const options={maxCells:10000};
    const first=JSON.stringify(api.analyzeFiles(paths,"all",options));
    for(let i=0;i<2;i++)assert.equal(JSON.stringify(api.analyzeFiles(paths,"all",options)),first);
    assert.deepEqual(paths,prior);assert.deepEqual(options,{maxCells:10000});
  });
  check("cache preserves numeric results and rejects malformed records",()=>{
    const a=input("cache-a.js","const x=1"),b=input("cache-b.js","while(x) x--;");
    const cache=path.join(root,"cache");
    const first=api.analyzeFiles([a,b],"all",{cacheDir:cache});
    const second=api.analyzeFiles([a,b],"all",{cacheDir:cache});
    assert.deepEqual(first.matrix,second.matrix);assert.equal(second.metadata.cache.hits,1);
    const cacheFile=path.join(cache,"ast_tree_edit_similarity_v2",fs.readdirSync(path.join(cache,"ast_tree_edit_similarity_v2"))[0]);
    fs.writeFileSync(cacheFile,"{truncated");
    const third=api.analyzeFiles([a,b],"all",{cacheDir:cache});
    assert.deepEqual(third.matrix,first.matrix);assert.equal(third.metadata.cache.hits,0);
    const fourth=api.analyzeFiles([a,b],"all",{cacheDir:cache});assert.equal(fourth.metadata.cache.hits,1);
  });
  check("prototype-like identifiers and filenames do not pollute prototypes",()=>{
    const before=Object.getOwnPropertyNames(Object.prototype);
    const a=input("__proto__.js","const __proto__ = {constructor: 1, prototype: 2};");
    const b=input("constructor.js","const value = {constructor: 3, prototype: 4};");
    matrixInvariant(api.analyzeFiles([a,b],api.AST_METRICS));
    assert.deepEqual(Object.getOwnPropertyNames(Object.prototype),before);
  });
  check("source files are not executed",()=>{
    const marker=path.join(root,"must-not-exist");
    const p=input("payload.js",`require("node:fs").writeFileSync(${JSON.stringify(marker)},"unexpected")`);
    api.analyzeFiles([p],"all");assert.ok(!fs.existsSync(marker));
  });
  check("empty/null/extreme option validation",()=>{
    const p=input("options.js","const x=1");
    for(const paths of [null,[],{},"x",[null]])assert.throws(()=>api.analyzeFiles(paths,"all"));
    for(const value of [0,-1,1.5,NaN,Infinity,"1",true,Number.MAX_SAFE_INTEGER+1]){
      assert.throws(()=>api.analyzeFiles([p],"all",{maxCells:value}));
    }
    for(const metrics of [[],["all","all"],["ast_tree_edit_similarity","ast_tree_edit_similarity"],["__proto__"]]){
      assert.throws(()=>api.analyzeFiles([p],metrics));
    }
  });
  const cli=path.join(path.dirname(sourceRoot),"bin/codevariability-js.js");
  check("CLI example creates or documents its output directory",()=>{
    const p=input("cli-input.js","const x=1");
    const output=path.join(root,"new-directory","analysis.json");
    const result=spawnSync(process.execPath,[cli,"ast",p,"--metric","all","--output",output],{encoding:"utf8",timeout:10000});
    assert.equal(result.status,0,result.stderr);
  });
  for(const args of [[],["--unknown"],["ast"],["ast","--metric","all","--directory","missing"],
    ["ast","--metric","all","--directory",root,"--max-cells","-1"],["ast","--metric","all","--bad"]]){
    const result=spawnSync(process.execPath,[cli,...args],{encoding:"utf8",timeout:10000});
    cases.push({args,status:result.status,signal:result.signal,stderr:result.stderr.slice(0,600)});
  }
  check("invalid CLI invocations never report success",()=>{
    for(const item of cases)assert.ok(item.status!==null&&item.status!==0);
  });
}finally{fs.rmSync(root,{recursive:true,force:true});}
const test=require("node:test");
for (const result of checks) test(result.name, () => assert.equal(result.status, "PASS", result.error));
