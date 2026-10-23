#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Vps,
    [Parameter(Mandatory=$true)][string]$Keystore,
    [string]$KeyAlias = 'scrabblya',
    [string]$DeployRoot = '/var/www/scrabblya',
    [int]$Port = 22,
    [string]$IdentityFile,
    [int]$VersionCode = 0,
    [string]$ApiUrl = 'https://scrabblya.aquarius.irish/api'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$mobile = Join-Path $repo 'mobile'
function Run([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program a echoue (code $LASTEXITCODE)." }
}
if ($Vps -notmatch '^[A-Za-z0-9_.-]+@[A-Za-z0-9.-]+$') { throw 'Vps attendu : utilisateur@serveur' }
if ($DeployRoot -notmatch '^/[A-Za-z0-9_/-]+$' -or $DeployRoot -eq '/' -or $DeployRoot.Contains('..')) { throw 'DeployRoot invalide.' }
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Port SSH invalide.' }
$Keystore = (Resolve-Path -LiteralPath $Keystore).Path
foreach ($tool in @('node','npm.cmd','npx.cmd','ssh','scp','tar')) { Get-Command $tool -ErrorAction Stop | Out-Null }
if (!$env:JAVA_HOME -or !(Test-Path "$env:JAVA_HOME/bin/javac.exe")) { throw 'Installe un JDK 21 et configure JAVA_HOME.' }
$javaVersion = & "$env:JAVA_HOME/bin/javac.exe" -version 2>&1
if ("$javaVersion" -notmatch 'javac 21\.') { throw 'JAVA_HOME doit pointer vers un JDK 21.' }
if (!$env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$tools = Join-Path $env:ANDROID_HOME 'build-tools/36.0.0'
foreach ($file in @('apksigner.bat','aapt.exe')) {
    if (!(Test-Path "$tools/$file")) { throw "SDK Android incomplet : $tools/$file" }
}
$sshArgs = @('-p', "$Port")
$scpArgs = @('-P', "$Port")
if ($IdentityFile) {
    $identity = (Resolve-Path -LiteralPath $IdentityFile).Path
    $sshArgs += @('-i', $identity); $scpArgs += @('-i', $identity)
}
# Read the published version before spending time compiling. SSH also checks permissions.
$remoteCheck = @'
set -eu
root='__ROOT__'
echo "SSH connected as $(id -un)" >&2
if ! test -d "$root"; then
  echo "ERROR: deployment directory does not exist: $root" >&2
  exit 31
fi
if ! test -w "$root" || ! test -x "$root"; then
  echo "ERROR: $(id -un) cannot write/access $root" >&2
  ls -ld "$root" >&2
  exit 32
fi
for tool in node flock tar bash install sha256sum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: missing VPS command: $tool (PATH=$PATH)" >&2
    exit 33
  fi
done
if test -f "$root/current/release.json"; then
  node - "$root/current/release.json" <<'NODE'
const fs = require('fs');
const code = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).versionCode;
if (!Number.isInteger(code) || code < 1) throw Error('Invalid published versionCode');
console.log(code);
NODE
else
  echo 0
fi
'@
$remoteCheck = $remoteCheck.Replace('__ROOT__', $DeployRoot).Replace("`r`n", "`n").TrimEnd() + "`n"
# Windows PowerShell can add CRLF when piping text into a native process.
# Base64 transports the exact UTF-8/LF bytes, including the final newline.
$remotePayload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteCheck))
$current = & ssh @sshArgs $Vps "printf '%s' '$remotePayload' | base64 --decode | bash -s"
$remoteExit = $LASTEXITCODE
if ($remoteExit -ne 0) {
    switch ($remoteExit) {
        31 { throw "Le dossier $DeployRoot est absent sur le VPS." }
        32 { throw "SSH fonctionne, mais le compte $Vps ne peut pas ecrire dans $DeployRoot. Voir les droits affiches ci-dessus." }
        33 { throw 'SSH fonctionne, mais une commande manque sur le VPS. Voir ERROR ci-dessus.' }
        255 { throw 'Connexion SSH interrompue ou refusee. Voir le message SSH ci-dessus.' }
        default { throw "Verification VPS echouee (code $remoteExit). Voir le detail ci-dessus." }
    }
}
$published = 0
if (![int]::TryParse((($current | Select-Object -Last 1).ToString().Trim()), [ref]$published)) { throw 'Version distante illisible.' }
if ($VersionCode -eq 0) {
    $minutes = [int][Math]::Floor(([DateTime]::UtcNow - [DateTime]'2020-01-01').TotalMinutes)
    $VersionCode = [Math]::Max($minutes, $published + 1)
}
if ($VersionCode -le $published -or $VersionCode -gt 2100000000) { throw 'VersionCode doit etre superieur a la version publiee et <= 2100000000.' }
$names = @('SCRABBLYA_REQUIRE_PUSH','ANDROID_KEYSTORE_FILE','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD','ANDROID_VERSION_CODE','CI','EXPO_NO_DOTENV','EXPO_PUBLIC_API_URL','NODE_OPTIONS','PATH')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
function Read-Secret([string]$Prompt) {
    $secret = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
$output = Join-Path $mobile "dist/local-release-$VersionCode"
$remote = '/tmp/scrabblya-upload-' + [Guid]::NewGuid().ToString('N')
$pushed = $false
Push-Location $mobile
try {
    $env:ANDROID_KEYSTORE_FILE = $Keystore
    $env:ANDROID_KEY_ALIAS = $KeyAlias
    $env:ANDROID_KEYSTORE_PASSWORD = Read-Secret 'Mot de passe du keystore'
    $keyPassword = Read-Secret 'Mot de passe de la cle (Entree = identique au keystore)'
    $env:ANDROID_KEY_PASSWORD = if ($keyPassword) { $keyPassword } else { $env:ANDROID_KEYSTORE_PASSWORD }
    $keyPassword = $null
    $env:ANDROID_VERSION_CODE = "$VersionCode"
    $env:SCRABBLYA_REQUIRE_PUSH = '1'
    $env:CI = '1'; $env:EXPO_NO_DOTENV = '1'; $env:EXPO_PUBLIC_API_URL = $ApiUrl
    $env:NODE_OPTIONS = '--max-old-space-size=2048'
    $env:PATH = "$env:JAVA_HOME/bin;$env:PATH"
    Run 'npm.cmd' @('ci')
    Run 'node' @('scripts/check-native-linking.cjs')
    Run 'npx.cmd' @('expo','prebuild','--platform','android','--no-install')
    Run 'node' @('scripts/configure-android-release.cjs')
    Push-Location android
    try {
        Run '.\gradlew.bat' @(':app:assembleRelease','--no-daemon','--build-cache','--max-workers=1','-Dorg.gradle.parallel=false','-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m','-PreactNativeArchitectures=armeabi-v7a,arm64-v8a')
    } finally { Pop-Location }
    $apk = Join-Path $mobile 'android/app/build/outputs/apk/release/app-release.apk'
    Run "$tools/apksigner.bat" @('verify','--verbose',$apk)
    $cert = Join-Path $mobile "dist/release-cert-$VersionCode.der"
    New-Item -ItemType Directory -Path (Split-Path $cert) -Force | Out-Null
    try {
        Run "$env:JAVA_HOME/bin/keytool.exe" @('-exportcert','-keystore',$Keystore,'-alias',$KeyAlias,'-storepass:env','ANDROID_KEYSTORE_PASSWORD','-file',$cert)
        $expected = (Get-FileHash -LiteralPath $cert -Algorithm SHA256).Hash.ToLowerInvariant()
        $signers = & "$tools/apksigner.bat" verify --print-certs $apk
        if ($LASTEXITCODE -ne 0 -or !(($signers -join "`n").Contains("Signer #1 certificate SHA-256 digest: $expected"))) { throw 'Certificat APK different de la cle release.' }
    } finally { if (Test-Path $cert) { Remove-Item -LiteralPath $cert } }
    $badging = & "$tools/aapt.exe" dump badging $apk
    if ($LASTEXITCODE -ne 0 -or $badging[0] -notlike "*name='com.scrabblya.app'*" -or $badging[0] -notlike "*versionCode='$VersionCode'*" -or ($badging -match '^application-debuggable')) { throw 'Package, version ou mode release APK incorrect.' }
    Run 'node' @((Join-Path $PSScriptRoot 'build-download-page.cjs'),$apk,$output,"$VersionCode")
    # Send one archive; it contains only public release assets, never the signing key.
    $publisher = Join-Path $output 'publish-download.sh'
    [IO.File]::WriteAllText($publisher, [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'publish-download.sh')).Replace("`r`n","`n"), (New-Object Text.UTF8Encoding($false)))
    $archive = "$output.tar.gz"
    Run 'tar' @('-czf',$archive,'-C',$output,'.')
    Run 'ssh' ($sshArgs + @($Vps,"umask 077; mkdir '$remote'"))
    $pushed = $true
    Run 'scp' ($scpArgs + @($archive,"${Vps}:$remote/release.tar.gz"))
    Run 'ssh' ($sshArgs + @($Vps,"set -eu; tar -xzf '$remote/release.tar.gz' -C '$remote'; bash '$remote/publish-download.sh' '$remote' '$DeployRoot'"))
    Write-Host "Publie : https://scrabblya.aquarius.irish/telecharger/ (build $VersionCode)"
    Write-Host "Copie locale : $output"
} finally {
    if ($pushed) { & ssh @sshArgs $Vps "rm -rf -- '$remote'" }
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    Pop-Location
}
