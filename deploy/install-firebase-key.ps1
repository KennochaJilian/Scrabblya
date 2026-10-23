#requires -Version 5.1
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$Vps,
 [string]$ServiceAccount,
 [int]$Port=22,
 [string]$IdentityFile
)
$ErrorActionPreference='Stop'
if($Vps -notmatch '^[A-Za-z0-9_.-]+@[A-Za-z0-9.-]+$'){throw 'Vps attendu : utilisateur@serveur'}
if($Port -lt 1 -or $Port -gt 65535){throw 'Port SSH invalide.'}
if(!$ServiceAccount){
 $keys=@(Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE 'Downloads') -Filter 'scrabblya*firebase-adminsdk*.json' -File)
 if($keys.Count -ne 1){throw 'Precisez le fichier prive avec -ServiceAccount C:\chemin\cle.json'}
 $ServiceAccount=$keys[0].FullName
}
$ServiceAccount=(Resolve-Path -LiteralPath $ServiceAccount).Path
try{$keyData=Get-Content -LiteralPath $ServiceAccount -Raw | ConvertFrom-Json}catch{throw 'Le fichier JSON Firebase est invalide.'}
if($keyData.type -ne 'service_account' -or !$keyData.project_id -or !$keyData.private_key -or !$keyData.client_email){throw 'Le fichier choisi ne correspond pas a une cle de compte de service Firebase.'}
$keyData=$null
$sshArgs=@('-p',"$Port");$scpArgs=@('-P',"$Port")
if($IdentityFile){$identity=(Resolve-Path -LiteralPath $IdentityFile).Path;$sshArgs+=@('-i',$identity);$scpArgs+=@('-i',$identity)}
$remote=(& ssh @sshArgs $Vps 'umask 077; mktemp -d /tmp/scrabblya-firebase.XXXXXXXX')
if($LASTEXITCODE -ne 0){throw 'Connexion SSH impossible.'}
$remote=($remote -join "`n").Trim()
if($remote -notmatch '^/tmp/scrabblya-firebase\.[A-Za-z0-9]+$'){throw 'Dossier temporaire distant inattendu.'}
try{
 & scp @scpArgs $ServiceAccount "${Vps}:$remote/credentials.json"
 if($LASTEXITCODE -ne 0){throw 'Transfert de la cle impossible.'}
 & ssh @sshArgs -t $Vps "sudo install -d -m 700 /opt/scrabblya/secrets && sudo install -o 1000 -g 1000 -m 400 '$remote/credentials.json' /opt/scrabblya/secrets/firebase-service-account.json"
 if($LASTEXITCODE -ne 0){throw 'Installation impossible : verifiez les droits sudo du compte SSH.'}
 Write-Host 'Cle installee sur le VPS. Le conteneur Node peut la lire, sans la copier dans son image.'
}finally{
 & ssh @sshArgs $Vps "rm -f -- '$remote/credentials.json'; rmdir -- '$remote'"
}
