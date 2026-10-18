# APK Android et page de téléchargement

Le pipeline Azure utilise uniquement le pool VPS existant `vps-alexandrya`. Après les tests et l’image API, il compile une APK release signée et autonome, publie l’artefact `scrabblya-android`, puis met à jour `https://scrabblya.aquarius.irish/telecharger/` sur le même VPS. Aucun compte EAS ni compte Google Play n’est requis.

## 1. Préparer l’agent VPS une seule fois

Agent Linux x86_64, Node 22 fourni par le pipeline. Prévoir environ 15–20 Go libres pour le SDK, le NDK et les caches. La compilation React Native est plus exigeante que l’API : vérifier `free -h` et `df -h`, et disposer de plusieurs Go de mémoire disponibles ou de swap. Gradle est limité à deux workers et 2 Go de heap ; éviter une compilation sur un petit VPS déjà saturé.

Après récupération du dépôt sur le VPS :

```bash
sudo bash deploy/android/setup-agent.sh azagent
```

Ce script cible Debian/Ubuntu. Il utilise OpenJDK 21 depuis les dépôts s’il est disponible, sinon Eclipse Temurin 21 depuis son archive officielle vérifiée par SHA-256. Java est accessible à un chemin stable `/opt/scrabblya/java-21`. Il installe aussi les outils Android dans `/opt/android-sdk`, en vérifiant le SHA-256 du téléchargement officiel. Adapter `androidJavaHome` dans le YAML si la distribution utilise un autre chemin Java.

Lire et accepter les licences du SDK depuis le compte de l’agent :

```bash
sudo -u azagent env JAVA_HOME=/opt/scrabblya/java-21 \
  /opt/android-sdk/cmdline-tools/latest/bin/sdkmanager \
  --sdk_root=/opt/android-sdk --licenses
```

Le pipeline installe ensuite les versions requises : SDK 36, build-tools 36.0.0, NDK 27.1.12297006 et CMake 3.22.1. Aucun émulateur n’est installé. Il produit une APK pour les téléphones ARM 32 et 64 bits.

## 2. Créer la clé de signature

S’il existe déjà une APK diffusée de Scrabblya, réutiliser sa clé de signature. Sinon, générer la première clé une seule fois avec Java 21, par exemple depuis un terminal personnel sur le VPS :

```bash
/opt/scrabblya/java-21/bin/keytool -genkeypair -v \
  -keystore "$HOME/scrabblya-release.jks" -storetype JKS \
  -alias scrabblya -keyalg RSA -keysize 3072 -validity 10000 \
  -dname "CN=Scrabblya"
```

Les mots de passe sont demandés dans le terminal, sans apparaître dans la commande. Conserver une sauvegarde privée du fichier et des mots de passe : toutes les mises à jour doivent utiliser cette même clé. Si le mot de passe de clé est laissé identique au mot de passe du keystore, utiliser cette même valeur dans les deux secrets Azure.

## 3. Configurer Azure DevOps

Dans **Pipelines → Library → Secure files**, importer le fichier sous le nom exact :

```text
scrabblya-release.jks
```

Autoriser le pipeline Scrabblya à utiliser ce fichier. Dans les variables du pipeline, ajouter :

| Variable | Valeur | Secret |
|---|---|---|
| `ANDROID_KEYSTORE_PASSWORD` | Mot de passe du fichier JKS | Oui |
| `ANDROID_KEY_PASSWORD` | Mot de passe de la clé | Oui |
| `ANDROID_KEY_ALIAS` | `scrabblya` | Non |

Ne pas placer ces valeurs dans le YAML, Git, les propriétés Gradle ou une variable `EXPO_PUBLIC_*`. Le fichier sécurisé est supprimé automatiquement par Azure à la fin du job. Le projet natif généré ne contient que des références aux variables d’environnement.

Le YAML contient déjà l’URL publique :

```text
https://scrabblya.aquarius.irish/api
```

Les fichiers `.env` locaux sont ignorés pendant cette compilation (`EXPO_NO_DOTENV=1`). `versionName` vient de `mobile/app.json`, `versionCode` de `Build.BuildId`. Pour les mises à jour, conserver `com.scrabblya.app`, la signature et un `versionCode` supérieur. Le script refuse un code Android invalide ; la publication refuse une version plus ancienne que celle déjà en ligne.

En lancement manuel, choisir **releaseTarget = api** pour publier uniquement l’image API sans charger les étapes Android. Choisir **apk** ou **all** pour compiler Android. Pour obtenir seulement l’artefact APK sans mettre à jour la page publique, décocher **publishAndroid**. Le mode **auto** utilise le préfixe du titre du dernier commit.

## 4. Préparer le dossier Apache

Sur le VPS, une seule fois :

```bash
sudo mkdir -p /var/www/scrabblya
sudo chown azagent:www-data /var/www/scrabblya
sudo chmod 2755 /var/www/scrabblya
```

Le pipeline publie sans sudo. Les fichiers sont lisibles par Apache, et l’utilisateur `azagent` conserve la propriété du dossier.

Le vhost `deploy/apache/scrabblya.conf` contient désormais les alias `/telecharger/` et `/telecharger/apk/`. Reporter ce bloc dans le vhost HTTPS réellement actif : si Certbot a créé `scrabblya-le-ssl.conf`, il faut aussi y mettre les alias et le bloc `<Directory>`. Modifier seulement le vhost HTTP redirigé vers HTTPS ne suffit pas.

Les directives à ajouter, avant les `ProxyPass /api/`, sont dans le fichier du dépôt. Elles servent la page courante via le lien symbolique `current`, et les APK versionnées via `apks`. Les APK sont servies avec leur type MIME Android et en pièce jointe ; la page est revalidée pour éviter une ancienne version en cache. Le proxy de l’API reste inchangé.

Puis :

```bash
sudo /usr/sbin/apachectl configtest
sudo systemctl reload apache2
```

## 5. Lancer et vérifier

Le pipeline sélectionne d’abord les actions avec `select_release`, puis lance les tests communs dans `validate`. Selon le préfixe de commit :

- `publish_api` construit et publie l’image Docker ;
- `android_release` réalise le prébuild Expo, signe et compile l’APK, puis vérifie certificat, package, versionCode et caractère non-debuggable ;
- `publish_android` met à jour la page sur le VPS après succès de la compilation Android.

Le mode APK seul ne dépend pas de la publication Docker.

La première compilation peut être longue à cause des téléchargements et du code natif. Le cache Gradle reste dans `$(Agent.ToolsDirectory)/scrabblya-gradle`.

Après succès :

```bash
curl -I https://scrabblya.aquarius.irish/telecharger/
curl --fail https://scrabblya.aquarius.irish/telecharger/release.json
```

Ouvrir la page sur un téléphone, télécharger puis installer l’APK. L’application contient le JavaScript et les ressources : Expo Go et le PC de développement ne sont plus nécessaires. Les parties utilisent l’API HTTPS sur le VPS.

## Publication et historique

Chaque build publie `scrabblya-<version>-<versionCode>.apk`, son empreinte SHA-256 et les métadonnées JSON. Le script vérifie l’empreinte avant d’écrire, prend un verrou de publication, puis bascule le lien `current` en une opération. Une compilation qui échoue laisse la page précédente en place. Les liens des anciennes APK restent disponibles ; un retour arrière du contenu de l’app doit être recompilé avec un code supérieur pour pouvoir être installé comme mise à jour.

Les anciennes APK ne sont pas supprimées automatiquement. Prévoir un nettoyage manuel des très anciennes versions si l’espace disque devient limité.

## Sources

- https://docs.expo.dev/guides/local-app-production/
- https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/download-secure-file-v1
- https://developer.android.com/studio (outils Android et SHA-256 épinglés dans le script)
