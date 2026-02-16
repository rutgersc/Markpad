npm run tauri build -- --bundles nsis
& (Get-ChildItem "$PSScriptRoot\src-tauri\target\release\bundle\nsis\*.exe" | Select-Object -First 1).FullName
