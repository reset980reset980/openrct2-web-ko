#!/usr/bin/env python3
"""Build the public OpenRCT2 web asset bundle without proprietary RCT2 data."""
from __future__ import annotations

import argparse
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import tarfile
import tempfile
import urllib.request
import zipfile

API = "https://api.github.com/repos/OpenRCT2/OpenRCT2/releases/latest"
USER_AGENT = "openrct2-web-ko-assets/1.0"


def latest_portable_url() -> str:
    request = urllib.request.Request(API, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        release = json.load(response)
    for asset in release.get("assets", []):
        name = asset.get("name", "")
        if name.endswith("Linux-noble-x86_64.tar.gz"):
            return asset["browser_download_url"]
    raise RuntimeError("최신 OpenRCT2 Linux portable 자산을 찾지 못했습니다.")


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output)


def extract_public_data(archive: Path, destination: Path) -> None:
    prefix = PurePosixPath("OpenRCT2/data")
    with tarfile.open(archive, "r:gz") as bundle:
        for member in bundle:
            path = PurePosixPath(member.name)
            try:
                relative = path.relative_to(prefix)
            except ValueError:
                continue
            if not relative.parts or member.isdir():
                continue
            if member.issym() or member.islnk() or not member.isfile():
                continue
            if relative.is_absolute() or ".." in relative.parts:
                raise RuntimeError(f"안전하지 않은 archive 경로: {member.name}")
            source = bundle.extractfile(member)
            if source is None:
                continue
            target = destination.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with source, target.open("wb") as output:
                shutil.copyfileobj(source, output)


def make_zip(source: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    # 이미 압축된 음악/오브젝트가 대부분이다. STORE 방식은 Vercel 100MB 한도 안에서
    # 브라우저의 CPU 부담과 최초 실행 시간을 크게 줄인다.
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as bundle:
        for path in sorted(source.rglob("*")):
            if path.is_file():
                bundle.write(path, path.relative_to(source).as_posix())


def validate(source: Path, output: Path) -> None:
    required = [
        source / "language/ko-KR.txt",
        source / "fonts/NanumGothic.ttf",
        source / "fonts/OFL-NanumGothic.txt",
    ]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise RuntimeError("공개 웹 자산 누락: " + ", ".join(missing))
    forbidden = [path for path in source.rglob("*") if path.is_file() and path.name.lower() == "ch.dat"]
    if forbidden:
        raise RuntimeError("유료 RCT2 자산 ch.dat가 공개 bundle에 포함될 수 없습니다.")
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError("assets.zip 생성 실패")
    if output.stat().st_size >= 100_000_000:
        raise RuntimeError(f"assets.zip이 Vercel 100MB 제한을 초과했습니다: {output.stat().st_size} bytes")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, help="공식 OpenRCT2 Linux portable tar.gz 경로")
    parser.add_argument("--output", type=Path, default=Path("build/www/assets.zip"))
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]

    with tempfile.TemporaryDirectory(prefix="openrct2-web-assets-") as temporary:
        temp = Path(temporary)
        archive = args.archive
        if archive is None:
            archive = temp / "openrct2-portable.tar.gz"
            download(latest_portable_url(), archive)
        extract_root = temp / "assets"
        extract_root.mkdir()
        extract_public_data(archive.resolve(), extract_root)

        font_root = root / "emscripten/assets/fonts"
        target_fonts = extract_root / "fonts"
        target_fonts.mkdir(exist_ok=True)
        shutil.copy2(font_root / "NanumGothic.ttf", target_fonts / "NanumGothic.ttf")
        shutil.copy2(font_root / "OFL-NanumGothic.txt", target_fonts / "OFL-NanumGothic.txt")

        output = args.output if args.output.is_absolute() else root / args.output
        make_zip(extract_root, output)
        validate(extract_root, output)
        print(f"assets.zip={output} bytes={output.stat().st_size}")


if __name__ == "__main__":
    main()
