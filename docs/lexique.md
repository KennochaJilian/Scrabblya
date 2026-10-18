# Lexique de Scrabblya

## Source intégrée

Lexique des formes fléchies du français **Grammalecte 7.7**, Olivier R. et contributeurs Dicollecte, sous **MPL 2.0**.
Archive officielle : https://grammalecte.net/dic/lexique-grammalecte-fr-v7.7.zip

L’archive contient déjà pluriels et conjugaisons : aucune expansion approximative des affixes Hunspell n’est nécessaire. La liste dérivée embarquée contient **405 616 mots** de 2 à 15 lettres. Elle est utilisable hors ligne et indépendante de toute API.

## Politique familiale v1

- Accepter les analyses grammaticales de noms communs, adjectifs, adverbes, mots grammaticaux, interjections, nombres écrits et verbes.
- Accepter les sous-dictionnaires commun, classique, moderne et rectifié (`*`, `C`, `M`, `R`), y compris leurs combinaisons. Les anciennes et nouvelles orthographes sont donc possibles.
- Exclure les analyses de noms propres, prénoms, patronymes, titres, préfixes/suffixes isolés et catégories non admises.
- Exclure les notes d’abréviation, sigle, symbole et abréviation typographique (`abr`, `sig`, `symb`, `abty`).
- Rejeter avant normalisation les formes avec majuscules, espaces, chiffres ou ponctuation ; conserver une forme si au moins une de ses analyses est admissible.
- Convertir œ en OE, æ en AE, enlever les diacritiques et passer en majuscules. Garder uniquement A-Z et 2 à 15 lettres.

Ce lexique familial diffère de l’ODS officiel. Les filtres sont explicites et versionnés ; ils ne prétendent pas reproduire les décisions des compétitions.

## Reproduction et licence

L’archive, la notice des auteurs et le texte MPL sont conservés dans `mobile/vendor/grammalecte/`. Le fichier dérivé `mobile/src/data/words.json` est également sous MPL 2.0 ; son code source de transformation est `mobile/scripts/build-lexicon.cjs`.

```powershell
cd mobile
Expand-Archive vendor/grammalecte/lexique-grammalecte-fr-v7.7.zip -DestinationPath vendor/grammalecte -Force
npm run lexicon:build
```

`lexicon-meta.json` conserve les empreintes SHA-256 de la source et de la liste triée. Chaque partie conserve l’identifiant du lexique. Un changement de lexique ne doit pas modifier silencieusement une partie existante.

## ODS

L’ODS reste une source potentielle si une autorisation et une liste adaptées sont obtenues. La FISF demande une autorisation écrite préalable de Larousse pour diffuser des extraits : https://fisf.net/lofficiel-du-scrabble/questions-reponses/ . Aucune liste ODS n’est intégrée.
