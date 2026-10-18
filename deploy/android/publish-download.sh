#!/usr/bin/env bash
set -euo pipefail
umask 022
artifact="${1:?Usage: publish-download.sh artifact-directory deploy-directory}"
root="${2:?Missing deployment directory}"
[[ "$root" = /* && "$root" != / ]] || { echo 'Invalid deployment directory' >&2; exit 1; }
[[ -d "$root" && -w "$root" ]] || { echo 'Prepare the deployment directory for azagent first.' >&2; exit 1; }
mapfile -t release < <(node - "$artifact" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const dir=process.argv[2],meta=JSON.parse(fs.readFileSync(path.join(dir,'release.json'),'utf8'));
if(!Number.isInteger(meta.versionCode)||meta.versionCode<1||meta.versionCode>2100000000||!/^scrabblya-[A-Za-z0-9._-]+\.apk$/.test(meta.filename)||!/^([a-f0-9]{64})$/.test(meta.sha256))throw Error('Invalid release metadata');
const apk=fs.readFileSync(path.join(dir,meta.filename));
if(crypto.createHash('sha256').update(apk).digest('hex')!==meta.sha256||apk.length!==meta.sizeBytes)throw Error('APK checksum mismatch');
for(const file of ['index.html','styles.css','icon.png',meta.filename+'.sha256'])if(!fs.statSync(path.join(dir,file)).isFile())throw Error('Incomplete release');
console.log(meta.versionCode);console.log(meta.filename);console.log(meta.sha256);
NODE
)
[[ ${#release[@]} -eq 3 ]] || { echo 'Release validation failed' >&2; exit 1; }
code="${release[0]}"; filename="${release[1]}"; sha="${release[2]}"
exec 9>"$root/.publish.lock"
flock 9
if [[ -f "$root/current/release.json" ]]; then
  current=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).versionCode)' "$root/current/release.json")
  [[ "$current" =~ ^[0-9]+$ ]] || exit 1
  if (( code < current )); then echo 'A newer APK is already published; refusing a downgrade.' >&2; exit 1; fi
fi
mkdir -p "$root/apks" "$root/releases/$code"
if [[ -f "$root/apks/$filename" ]]; then
  existing=$(sha256sum "$root/apks/$filename"); existing="${existing%% *}"
  [[ "$existing" = "$sha" ]] || { echo 'Immutable APK name already contains another file.' >&2; exit 1; }
else
  install -m 644 "$artifact/$filename" "$root/apks/.$filename.tmp"
  mv -f "$root/apks/.$filename.tmp" "$root/apks/$filename"
fi
install -m 644 "$artifact/$filename.sha256" "$root/apks/$filename.sha256"
for file in index.html styles.css icon.png release.json; do install -m 644 "$artifact/$file" "$root/releases/$code/$file"; done
ln -sfn "releases/$code" "$root/.current-$code"
mv -Tf "$root/.current-$code" "$root/current"
echo "Scrabblya build $code published."
