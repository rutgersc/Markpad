npm run tauri build -- --bundles nsis
& (Get-ChildItem "$PSScriptRoot\src-tauri\target\release\bundle\nsis\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
