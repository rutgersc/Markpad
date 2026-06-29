$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

Push-Location $PSScriptRoot
try {
	npm install

	# A local personal install doesn't need signed auto-update artifacts — the
	# signing key (TAURI_SIGNING_PRIVATE_KEY) is a maintainer-only release secret.
	# Merge an override that disables them so the build doesn't demand the key.
	$override = Join-Path ([System.IO.Path]::GetTempPath()) 'markpad-local-build.conf.json'
	'{"bundle":{"createUpdaterArtifacts":false}}' | Set-Content -Path $override -Encoding utf8

	npm run tauri build -- --bundles nsis --config $override

	& (Get-ChildItem "$PSScriptRoot\src-tauri\target\release\bundle\nsis\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}
finally {
	Pop-Location
}
