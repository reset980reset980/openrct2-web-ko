import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../emscripten/static/index.js',import.meta.url),'utf8');
const constants=source.match(/const MAX_ZIP_BYTES[\s\S]*?const MAX_EXTRACTED_BYTES[^;]+;/)?.[0];
const functions=source.match(/async function extractZip[\s\S]*?(?=async function clearDatabase)/)?.[0];
assert.ok(constants&&functions,'ZIP 안전 함수 추출 실패');

function harness(files){
  const writes=[];
  const directories=[];
  const status={innerText:''};
  const context={
    files,
    JSZip:class{async loadAsync(){return {files};}},
    Module:{FS:{mkdir(){},mkdirTree(path){directories.push(path);},writeFile(path,data){writes.push([path,data]);}}},
    document:{getElementById(){return status;}},
  };
  vm.createContext(context);
  vm.runInContext(`${constants}\n${functions}`,context);
  return {context,writes,directories,status};
}

test('extractZip rejects traversal and absolute entries',async()=>{
  for(const name of ['../persistent/payload','/absolute/payload','C:/payload','safe/../../payload']){
    const {context,writes,status}=harness({[name]:{dir:false,async:async()=>new Uint8Array([1])}});
    const ok=await vm.runInContext(`extractZip({size:1},()=>'/RCT/')`,context);
    assert.equal(ok,false,name);
    assert.equal(writes.length,0,name);
    assert.match(status.innerText,/안전하지 않은 ZIP 경로/);
  }
});

test('extractZip accepts a normal RCT2 data path',async()=>{
  const {context,writes,directories}=harness({'Data/':{dir:true},'Data/ch.dat':{dir:false,async:async()=>new Uint8Array([1,2,3])}});
  const ok=await vm.runInContext(`extractZip({size:3},()=>'/RCT/')`,context);
  assert.equal(ok,true);
  assert.deepEqual(writes.map(x=>x[0]),['/RCT/Data/ch.dat']);
  assert.deepEqual(directories,['/RCT/Data']);
});

test('extractZip finds and flattens a nested RCT2 install folder',async()=>{
  const files={
    'RollerCoaster Tycoon 2/Data/ch.dat':{dir:false,async:async()=>new Uint8Array([1])},
    'RollerCoaster Tycoon 2/ObjData/ride.dat':{dir:false,async:async()=>new Uint8Array([2])},
    '__MACOSX/metadata':{dir:false,async:async()=>new Uint8Array([3])},
  };
  const {context,writes}=harness(files);
  const root=JSON.parse(await vm.runInContext(`JSON.stringify(findRCT2ArchiveRoot({files}))`,context));
  assert.deepEqual(root,{base:'/RCT/',stripPrefix:'RollerCoaster Tycoon 2/'});
  const ok=await vm.runInContext(`extractZip({size:3},()=>findRCT2ArchiveRoot({files}))`,context);
  assert.equal(ok,true);
  assert.deepEqual(writes.map(x=>x[0]),['/RCT/Data/ch.dat','/RCT/ObjData/ride.dat']);
});

test('extractZip rejects oversized compressed and extracted data',async()=>{
  {
    const {context,writes,status}=harness({});
    const ok=await vm.runInContext(`extractZip({size:MAX_ZIP_BYTES+1},()=>'/RCT/')`,context);
    assert.equal(ok,false);
    assert.equal(writes.length,0);
    assert.match(status.innerText,/1GB 이하/);
  }
  {
    const tooLarge=1536*1024*1024+1;
    const {context,writes,status}=harness({'Data/ch.dat':{dir:false,async:async()=>({byteLength:tooLarge})}});
    const ok=await vm.runInContext(`extractZip({size:1},()=>'/RCT/')`,context);
    assert.equal(ok,false);
    assert.equal(writes.length,0);
    assert.match(status.innerText,/압축을 푼 데이터가 너무 큽니다/);
  }
});
