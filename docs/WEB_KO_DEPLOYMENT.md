# OpenRCT2 Web 한국어 · Vercel 배포

공식 OpenRCT2 `develop` 브랜치의 Emscripten 타깃을 바탕으로 한 한국어 웹 배포판이다.

## 보장하는 범위

- C++ OpenRCT2 엔진을 WebAssembly로 브라우저에서 실행한다.
- 첫 화면과 오류·원본 데이터 업로드 안내는 한국어다.
- 게임 내부 기본 locale은 `ko-KR`이다.
- Emscripten FreeType 포트와 OFL Nanum Gothic을 포함해 한글 글리프를 렌더링한다.
- RCT2 원본 파일은 서버에 업로드하지 않고 브라우저 IndexedDB에서만 처리한다.
- OpenRCT2 공개 데이터만 약 84MB의 저장형 `assets.zip`으로 배포한다. 이미 압축된 오디오를 다시 DEFLATE하지 않아 첫 실행 CPU 부담을 줄이며 Vercel 100MB 단일 파일 한도 안이다.
- 유료 RCT2 파일 `Data/ch.dat`은 빌드·배포 자산에 포함하지 않는다.

## 라이선스

- OpenRCT2와 이 수정판: GPL-3.0-or-later
- Nanum Gothic: SIL Open Font License 1.1
- JSZip: MIT
- RollerCoaster Tycoon 2 원본 데이터: 사용자가 합법적으로 구매한 사본을 직접 제공해야 한다.

## 빌드

공식 CI와 같은 컨테이너를 사용한다.

```bash
docker run --rm \
  -v "$PWD:/src" \
  -w /src \
  ghcr.io/openrct2/openrct2-build:26-emscripten \
  bash -lc '. scripts/setenv && build-emscripten'
```

이미 받은 공식 Linux portable archive를 재사용하려면 컨테이너에 마운트하고 다음 환경 변수를 설정한다.

```bash
OPENRCT2_PORTABLE_ARCHIVE=/tmp/openrct2-release.tar.gz
```

산출물은 `build/www/`에 생성된다.

```text
index.html
index.js
style.css
openrct2.zip
assets.zip
vercel.json
vendor/jszip.min.js
```

## 로컬 검증

```bash
python3 scripts/serve-web-ko.py --port 8080
```

`http://127.0.0.1:8080`을 연다. 일반 `python -m http.server`는 SharedArrayBuffer에 필요한 COOP/COEP 헤더가 없으므로 사용하지 않는다.

## Vercel

```bash
vercel deploy build/www --prod --yes
```

`vercel.json`은 다음을 보장한다.

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Resource-Policy: same-origin`
- WASM MIME `application/wasm`
- WASM·ZIP 1일 캐시 후 재검증

## 플레이

1. Steam 또는 GOG에서 RollerCoaster Tycoon 2를 구매한다.
2. 설치 폴더에 `Data/ch.dat`가 있는지 확인한다.
3. 설치 폴더 내용 전체를 ZIP으로 압축한다.
4. 배포 사이트에서 ZIP을 선택한다.
5. 데이터는 현재 브라우저의 IndexedDB에 저장된다.

브라우저 사이트 데이터를 삭제하면 로컬 저장 데이터도 사라질 수 있으므로 공원 세이브를 주기적으로 내보낸다.
