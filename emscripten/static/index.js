/*****************************************************************************
 * Copyright (c) 2014-2026 OpenRCT2 developers
 *
 * For a complete list of all authors, please refer to contributors.md
 * Interested in contributing? Visit https://github.com/OpenRCT2/OpenRCT2
 *
 * OpenRCT2 is licensed under the GNU General Public License version 3.
 *****************************************************************************/
const MAX_ZIP_BYTES = 1024 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 50000;
const MAX_EXTRACTED_BYTES = 1536 * 1024 * 1024;

(async () =>
{
    await new Promise(res => window.addEventListener("DOMContentLoaded", res));
    document.getElementById("loadingWebassembly").innerText = "게임 엔진을 불러오는 중…";
    if (!window.SharedArrayBuffer)
    {
        document.getElementById("loadingWebassembly").innerText = "이 브라우저에서는 멀티스레드 WebAssembly를 시작할 수 없습니다.";
        document.getElementById("loadingDetail").innerText = "SharedArrayBuffer가 비활성화되었습니다. 최신 Chrome, Edge 또는 Firefox에서 다시 열어 주세요.";
        return;
    }
    if (!window.WebAssembly)
    {
        document.getElementById("loadingWebassembly").innerText = "이 브라우저는 WebAssembly를 지원하지 않습니다.";
        document.getElementById("loadingDetail").innerText = "최신 브라우저로 업그레이드한 뒤 다시 시도해 주세요.";
        return;
    }

    let assets;
    try
    {
        let req = await fetch("openrct2.zip");
        if (!req.ok) {
            throw new Error("Response is not ok!")
        }
        let data = await req.blob();
        let zip = new JSZip();
        let contents = await zip.loadAsync(data);
        assets = {
            js: URL.createObjectURL(new Blob([await zip.file("openrct2.js").async("uint8array")], {type: 'application/json'})),
            wasm: URL.createObjectURL(new Blob([await zip.file("openrct2.wasm").async("uint8array")], {type: 'application/wasm'}))
        }
    }
    catch(e)
    {
        assets = null;
        console.warn("Failed to fetch openrct2.zip. Will pull not-compressed files", e);
    }

    await new Promise(resolve => {
        const script = document.createElement("script");
        script.src = assets === null ? "openrct2.js" : assets.js;
        script.addEventListener("load", resolve);
        script.addEventListener("error", (e) => {
            document.getElementById("loadingWebassembly").innerText = "게임 엔진을 불러오지 못했습니다.";
            document.getElementById("loadingDetail").innerText = "네트워크 연결을 확인하고 페이지를 새로고침해 주세요.";
            console.error(e);
        });
        document.body.appendChild(script);
    })

    window.Module = await window.OPENRCT2_WEB({
        noInitialRun: true,
        arguments: [],
        preRun: [],
        postRun: [],
        canvas: document.getElementById("canvas"),
        print: function(msg)
        {
            console.log(msg);
        },
        printErr: function(msg)
        {
            console.log(msg);
        },
        totalDependencies: 0,
        monitorRunDependencies: () => {},
        locateFile: function(fileName)
        {
            if (assets !== null && fileName === "openrct2.wasm")
            {
                return assets.wasm;
            }
            console.log("loading", fileName);
            return fileName;
        }
    });

    await preparePersistentStorage();

    Module.FS.mkdir("/persistent");
    Module.FS.mount(Module.FS.filesystems.IDBFS, {autoPersist: true}, '/persistent');

    Module.FS.mkdir("/RCT");
    Module.FS.mount(Module.FS.filesystems.IDBFS, {autoPersist: false}, '/RCT');

    Module.FS.mkdir("/OpenRCT2");
    Module.FS.mount(Module.FS.filesystems.IDBFS, {autoPersist: false}, '/OpenRCT2');

    await new Promise(res => Module.FS.syncfs(true, res));

    const assetsOK = await updateAssets();
    if (!assetsOK)
    {
        return;
    }

    Module.FS.writeFile("/OpenRCT2/changelog.txt", "OpenRCT2 Web 한국어 배포판");
    document.getElementById("loadingWebassembly").innerText = "공개 자산을 브라우저에 저장하는 중…";
    await new Promise(res => Module.FS.syncfs(false, res));

    document.getElementById("loadingPanel").remove();

    let filesFound = fileExists("/RCT/Data/ch.dat");

    if (!filesFound)
    {
        document.getElementById("beforeLoad").style.display = "";
        await new Promise(res =>
        {
            document.getElementById("selectFile").addEventListener("change", async (e) =>
            {
                if (await extractZip(e.target.files[0], (zip) =>
                {
                    if (zip !== null)
                    {
                        if (zip.file("Data/ch.dat"))
                        {
                            document.getElementById("beforeLoad").remove();
                            return "/RCT/";
                        }
                        else if (zip.file("RCT/Data/ch.dat"))
                        {
                            document.getElementById("beforeLoad").remove();
                            return "/";
                        }
                    }
                    document.getElementById("statusMsg").innerText = "올바른 RCT2 데이터가 아닙니다. ZIP 안에 Data/ch.dat 파일이 들어 있어야 합니다.";
                    return false;
                }))
                {
                    document.getElementById("statusMsg").innerText = "원본 데이터를 브라우저에 저장하는 중…";
                    await new Promise(syncDone => Module.FS.syncfs(false, syncDone));
                    res();
                }
            });
        });
    }
    document.getElementById("launcher")?.remove();
    Module.canvas.style.display = "";
    Module.canvas.focus();
    Module.callMain(["--user-data-path=/persistent/", "--openrct2-data-path=/OpenRCT2/"]);
})();

async function updateAssets() {
    let currentVersion = "";
    try {
        currentVersion = Module.FS.readFile("/OpenRCT2/version", {encoding: "utf8"});
        console.log("Found asset version", currentVersion);
    } catch(e) {
        console.log("No asset version found");
    };
    let assetsVersion = "DEBUG";
    try {
        assetsVersion = Module.ccall("GetVersion", "string");
    } catch(e) {
        console.warn("Could not call 'GetVersion'! Is it added to EXPORTED_FUNCTIONS? Is ccall added to EXPORTED_RUNTIME_METHODS?");
    };

    //Always pull assets on a debug build
    if (currentVersion !== assetsVersion || assetsVersion.includes("DEBUG"))
    {
        console.log("Updating assets to", assetsVersion);
        document.getElementById("loadingWebassembly").innerText = "OpenRCT2 공개 자산을 내려받는 중…";
        document.getElementById("loadingDetail").innerText = "다운로드한 공개 자산은 이 브라우저에 저장됩니다.";
        await clearDatabase("/OpenRCT2/");

        // Fetch the assets.zip file
        const response = await fetch("assets.zip");
        if (!response.ok) {
            if (response.status === 404) {
                document.getElementById("loadingWebassembly").innerText = "필수 공개 자산 파일을 찾지 못했습니다. (404)";
            } else {
                document.getElementById("loadingWebassembly").innerText = `공개 자산 다운로드에 실패했습니다. (상태 ${response.status})`;
            }
            return false;
        } else {
            document.getElementById("loadingWebassembly").innerText = "공개 자산 다운로드 완료. 압축을 푸는 중…";
        }

        await extractZip(await response.arrayBuffer(), () => {
            return "/OpenRCT2/";
        });
        Module.FS.writeFile("/OpenRCT2/version", assetsVersion.toString());
    }
    return true;
}

async function extractZip(data, checkZip) {
    const compressedBytes = data?.size ?? data?.byteLength ?? 0;
    if (compressedBytes > MAX_ZIP_BYTES)
    {
        showZipError("ZIP 파일이 너무 큽니다. 1GB 이하의 RCT2 설치 데이터만 선택해 주세요.");
        return false;
    }

    let contents;
    try
    {
        const loading = document.getElementById("loadingWebassembly");
        if (loading) loading.innerText = "ZIP 파일 목록을 분석하는 중…";
        console.time("OpenRCT2 ZIP analysis");
        contents = await new JSZip().loadAsync(data);
        console.timeEnd("OpenRCT2 ZIP analysis");
        console.log("ZIP entries", Object.keys(contents.files).length);
    }
    catch(e)
    {
        if (typeof checkZip === "function") checkZip(null);
        showZipError("올바른 ZIP 파일이 아닙니다.");
        return false;
    }

    const entries = Object.keys(contents.files);
    if (entries.length > MAX_ZIP_ENTRIES)
    {
        showZipError("ZIP 안의 파일 수가 너무 많습니다.");
        return false;
    }

    let base = "/";
    if (typeof checkZip === "function")
    {
        const cont = checkZip(contents);
        if (cont === false) return false;
        base = cont;
    }

    const safeEntries = [];
    for (const key of entries)
    {
        const normalised = key.replaceAll("\\", "/");
        const parts = normalised.split("/");
        if (normalised.startsWith("/") || normalised.includes("\0") || normalised.includes(":") || parts.includes(".."))
        {
            showZipError("안전하지 않은 ZIP 경로가 포함되어 있습니다.");
            return false;
        }
        safeEntries.push({ entry: contents.files[key], normalised });
    }

    let extractedBytes = 0;
    const batchSize = 1;
    for (let offset = 0; offset < safeEntries.length; offset += batchSize)
    {
        const batch = safeEntries.slice(offset, offset + batchSize);
        const decoded = await Promise.all(batch.map(async ({ entry, normalised }) => ({
            entry,
            normalised,
            bytes: entry.dir ? null : await entry.async("uint8array"),
        })));
        for (const { entry, normalised, bytes } of decoded)
        {
            if (entry.dir)
            {
                try
                {
                    Module.FS.mkdir(base + normalised);
                }
                catch(e) {}
                continue;
            }

            extractedBytes += bytes.byteLength;
            if (extractedBytes > MAX_EXTRACTED_BYTES)
            {
                showZipError("압축을 푼 데이터가 너무 큽니다. 올바른 RCT2 설치 ZIP인지 확인해 주세요.");
                return false;
            }
            const targetPath = base + normalised;
            const parentPath = targetPath.slice(0, targetPath.lastIndexOf("/"));
            if (parentPath) Module.FS.mkdirTree(parentPath);
            Module.FS.writeFile(targetPath, bytes);
        }
        const loading = document.getElementById("loadingWebassembly");
        if (loading && safeEntries.length > 100)
        {
            loading.innerText = `파일 압축 해제 중… ${Math.min(offset + batchSize, safeEntries.length).toLocaleString()} / ${safeEntries.length.toLocaleString()}`;
        }
    }
    return true;
}

function showZipError(message) {
    const status = document.getElementById("statusMsg");
    if (status)
    {
        status.innerText = message;
        return;
    }
    const loading = document.getElementById("loadingWebassembly");
    if (loading) loading.innerText = message;
}

async function preparePersistentStorage() {
    if (!navigator.storage) return;
    try
    {
        if (navigator.storage.persist) await navigator.storage.persist();
        if (navigator.storage.estimate)
        {
            const { quota = 0 } = await navigator.storage.estimate();
            if (quota > 0 && quota < 1024 * 1024 * 1024)
            {
                const quotaMb = Math.round(quota / 1024 / 1024);
                const detail = document.getElementById("loadingDetail");
                if (detail) detail.innerText = `브라우저 저장 공간이 ${quotaMb}MB로 부족할 수 있습니다. 세이브를 자주 내보내 주세요.`;
            }
        }
    }
    catch(e)
    {
        console.warn("브라우저 저장 공간 확인 실패", e);
    }
}
async function clearDatabase(dir) {
    await new Promise(res => Module.FS.syncfs(false, res));
    const directories = [];
    const processFolder = (path) => {
        let contents;
        try
        {
            contents = Module.FS.readdir(path);
        }
        catch(e)
        {
            return;
        }
        for (const entry of contents)
        {
            if ([".", ".."].includes(entry)) continue;
            const child = path + entry;
            try
            {
                Module.FS.readFile(child);
                Module.FS.unlink(child);
            }
            catch(e)
            {
                const childDirectory = child + "/";
                processFolder(childDirectory);
                directories.push(childDirectory);
            }
        }
    };
    processFolder(dir);
    directories.sort((a, b) => b.length - a.length);
    for (const directory of directories)
    {
        try
        {
            Module.FS.rmdir(directory);
        }
        catch(e)
        {
            console.warn("폴더 삭제 실패", directory, e);
        }
    }
    await new Promise(res => Module.FS.syncfs(false, res));
}
function fileExists(path) {
    try {
        Module.FS.readFile(path);
        return true;
    } catch(e) {};
    return false;
}
