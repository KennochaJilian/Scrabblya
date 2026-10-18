# Compilation et publication depuis Windows

Le VPS sert uniquement les fichiers : aucune compilation n'y est effectuee.

## Preparation du PC

- Node.js 22 LTS, Git et client OpenSSH Windows (ssh/scp).
- JDK 21, avec JAVA_HOME vers le dossier du JDK.
- Android Studio : SDK Manager, installer Android SDK Platform 36, Build-Tools 36.0.0, Android SDK Command-line Tools, NDK 27.1.12297006 et CMake 3.22.1. Accepter les licences du SDK. ANDROID_HOME est utilise si defini, sinon le script utilise %LOCALAPPDATA%/Android/Sdk.
- Recuperer de maniere privee le meme scrabblya-release.jks que celui utilise dans Azure. Ne pas generer une autre cle si une APK a deja ete distribuee. Ne jamais committer la cle.
- Le compte SSH doit pouvoir ecrire dans /var/www/scrabblya. Le VPS doit disposer de Node, bash, tar et flock. La configuration Apache /telecharger deja preparee reste valable.

## Lancement

Depuis la racine du depot, dans PowerShell :

```powershell
.\deploy\android\build-publish-local.ps1 `
  -Vps 'azagent@ADRESSE_DU_VPS' `
  -Keystore 'C:\chemin-prive\scrabblya-release.jks'
```

Options : -KeyAlias scrabblya, -Port 22, -IdentityFile 'C:\chemin\cle-ssh', -DeployRoot /var/www/scrabblya, -VersionCode entier, -ApiUrl URL.

Les mots de passe de signature sont demandes sans affichage. Le script lit la version distante, choisit automatiquement un code superieur (ou valide celui fourni), installe les dependances, genere le projet natif, compile pour ARM 32 et 64 bits avec un seul worker, verifie la signature et le package, genere HTML/CSS/icone/metadonnees et transfere une archive publique via SCP. Le VPS valide le SHA256 et publie via le script existant, avec bascule du lien current. La cle et ses mots de passe ne sont pas transferes.

Les fichiers locaux sont conserves dans mobile/dist/local-release-<code> et l'archive voisine .tar.gz. Le projet Android genere et les sorties dist sont ignores par Git. La compilation peut prendre du temps au premier lancement. Garder une seule publication en cours a la fois.

La page est disponible sur https://scrabblya.aquarius.irish/telecharger/. Aucun redemarrage Apache n'est necessaire pour les publications suivantes. Ne plus declencher de commit [apk] ou [all] sur Azure tant que le build VPS est actif dans la pipeline ; utiliser [api] pour les deploiements API seuls.
