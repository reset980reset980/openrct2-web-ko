import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../emscripten/static/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../emscripten/static/index.js',import.meta.url),'utf8');
const deps=fs.readFileSync(new URL('../emscripten/deps.js',import.meta.url),'utf8');
const platform=fs.readFileSync(new URL('../src/openrct2/platform/Platform.Emscripten.cpp',import.meta.url),'utf8');
const buildScript=fs.readFileSync(new URL('../scripts/build-emscripten',import.meta.url),'utf8');
const vercel=JSON.parse(fs.readFileSync(new URL('../emscripten/static/vercel.json',import.meta.url),'utf8'));

test('Korean onboarding preserves the Emscripten runtime contract',()=>{
  assert.match(html,/<html lang="ko">/);
  for(const id of ['loadingWebassembly','beforeLoad','statusMsg','selectFile','canvas'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/RCT2 원본 데이터 ZIP/);
  assert.match(html,/브라우저 안에서만 처리/);
  assert.match(html,/GPL-3\.0/);
  assert.match(html,/reset980reset980\/openrct2-web-ko\/tree\/web-ko-vercel/);
  assert.doesNotMatch(html,/cdn\.jsdelivr\.net/);
  assert.match(html,/vendor\/jszip\.min\.js/);
});

test('Korean loader validates legal local assets and provides Korean errors',()=>{
  assert.match(js,/Data\/ch\.dat/);
  assert.match(js,/올바른 RCT2 데이터가 아닙니다/);
  assert.match(js,/WebAssembly를 지원하지 않습니다/);
  assert.match(js,/게임 엔진을 불러오는 중/);
  assert.match(js,/Module\.callMain/);
  assert.match(js,/autoPersist: true}, '\/persistent'/);
  assert.equal((js.match(/autoPersist: false/g)??[]).length,2);
  assert.match(deps,/현재 저장 데이터를 모두 지우고 복원하시겠습니까/);
  assert.match(deps,/세이브 파일 업로드 완료/);
});

test('Vercel headers enable threaded WebAssembly isolation',()=>{
  const headers=vercel.headers?.flatMap(rule=>rule.headers??[])??[];
  const values=Object.fromEntries(headers.map(x=>[x.key.toLowerCase(),x.value]));
  assert.equal(values['cross-origin-opener-policy'],'same-origin');
  assert.equal(values['cross-origin-embedder-policy'],'require-corp');
  assert.equal(values['cross-origin-resource-policy'],'same-origin');
});

test('Web build defaults the in-game locale to Korean',()=>{
  assert.match(platform,/const locale = "ko-KR"/);
});

test('Web build includes FreeType and a bundled Korean font path',()=>{
  assert.doesNotMatch(buildScript,/DISABLE_TTF=ON/);
  assert.match(buildScript,/USE_FREETYPE=1/);
  assert.match(buildScript,/INITIAL_MEMORY=512MB/);
  assert.doesNotMatch(buildScript,/INITIAL_MEMORY=2GB/);
  assert.match(platform,/\/OpenRCT2\/fonts\/NanumGothic\.ttf/);
  assert.match(platform,/font\.filename.*NanumGothic\.ttf/);
});
