# Vérifications de la première étape

- `npm run typecheck` : réussi.
- `npx expo export --platform android` : réussi, bundle et deux images exportés.
- Plateau : symétrie centrale, 8 mots triples, 16 mots doubles plus centre, 12 lettres triples et 24 lettres doubles vérifiés.
- Distribution française : 102 lettres, dont deux jokers, vérifiée.
- Pas encore testé visuellement sur émulateur ou appareil Android. Contrôler particulièrement le clavier, les petites cases et le zoom avant distribution.
- `npm audit` : 22 alertes (7 modérées, 15 élevées) dans les dépendances du template Expo 58, notamment la chaîne CLI/Metro et node-forge/uuid. À examiner et mettre à jour de façon compatible avant distribution ; ne pas appliquer automatiquement le downgrade majeur suggéré par audit.

Les interactions de démonstration ne constituent pas une validation du moteur de jeu ni du multijoueur. Aucun service distant n’est configuré.

## Glisser-déposer

Ajout du suivi tactile natif, surbrillance de la case cible et refus des cases occupées ou hors plateau. Défilement suspendu pendant le geste, reprise par toucher conservée. Lint et TypeScript validés ; quatre tests de coordonnées (bords, centre, défilement, absence de mesure). Le ressenti du geste reste à vérifier sur téléphone Android.


## Moteur et lexique familial

- 25 tests automatisés réussis : géométrie du dépôt, pioche de 102 lettres, placements, mots croisés invalides, bonus cumulés et réutilisation des anciennes cases, sept lettres, jokers, échanges, passes et fins de partie.
- Lexique réel de 405 616 mots : tests de pluriels/conjugaisons/ligatures et exclusions de noms propres/sigles/symboles.
- TypeScript, lint Expo et export Android réussis après intégration. Bundle Android : environ 6 Mo avec le lexique hors ligne.
- Sauvegarde AsyncStorage sérialisée et interface de passage du téléphone intégrées. La fermeture/réouverture, le tactile et les fenêtres de sélection doivent encore être testés sur Android réel ; aucune vérification instrumentée du stockage ou des gestes n’est revendiquée.
- Authentification, serveur et notifications restent hors de cette étape.

## Retour tactile et aperçu sur le plateau

- Coordonnées du doigt et mesures natives unifiées via pageX/pageY et measure(), sans mélange avec measureInWindow(). Point de prise et dimensions réelles du chevalet conservés pendant le geste ; callbacks tardifs ignorés après relâchement.
- Grille carrée positionnée explicitement : les arrondis de largeur ne peuvent plus renvoyer une cellule à la ligne suivante. Le dépôt utilise la même géométrie que la grille.
- Case cible agrandie avec guides de ligne/colonne ; rouge pour une case occupée.
- Valeurs visibles en bas à droite des tuiles posées, y compris zéro pour les jokers.
- Contours du mot complet et des croisements, verts si le coup est valide et rouges sinon. Pastille sur le plateau avec le total du coup (0 si invalide), ouvrant le détail ou l’explication. L’ancien texte de score sous le plateau a été retiré.
- 33 tests réussis, dont 8 nouveaux sur le point de prise, les décalages de coordonnées et les contours horizontaux/verticaux avec lettres existantes. TypeScript, lint et export Android réussis.
- Validation réelle du ressenti tactile et de la lisibilité à faire sur le téléphone du joueur ; les tests de coordonnées ne remplacent pas ce contrôle.

## Plateau bord à bord et tuile de déplacement

Guides de ligne/colonne supprimés, bordure violette individuelle des lettres posées retirée. Les contours rouge/vert du mot et la cible de dépôt restent disponibles. Plateau étendu à toute la largeur du téléphone (maximum 600 unités sur grand écran), les autres éléments conservent leur espacement. Tuile de déplacement agrandie de 20 % avec opacité 70 % ; le point de prise est agrandi dans les mêmes proportions pour conserver l’ancrage sous le doigt. TypeScript, lint et export Android réussis ; contrôle tactile à confirmer sur téléphone.

## Déplacement des lettres sur plateau et chevalet

Tuile sous le doigt agrandie (minimum 76 × 80, facteur 1,6 depuis le chevalet), transparence conservée. Les lettres du brouillon sont saisissables directement sur le plateau et peuvent être déplacées sur une case libre ou rendues au chevalet. Les lettres déjà validées restent fixes. Le chevalet utilise une insertion avec décalage des voisines, sans changer les indices des lettres utilisés par le moteur. Un dépôt invalide ou annulé conserve la tuile à son origine ; la lettre affectée à un joker est conservée lorsqu’il change de case.

39 tests passent, dont 6 nouveaux pour les déplacements et le réarrangement. TypeScript, lint et export Android réussis. Vérification des gestes à poursuivre sur téléphone réel.

## Écran de partie compact

Écran de jeu réorganisé sans défilement principal : bandeau compact de joueurs/scores, plateau central, chevalet et barre de commandes en bas. Les textes explicatifs, le dernier coup et l’historique permanent ont été retirés du plateau. Historique dans une fenêtre accessible par l’horloge ; menu pour accueil, passe, nouvelle partie et informations. Contrôles principaux avec icônes vectorielles et libellés accessibles. Les confirmations et erreurs conservent leurs textes utiles dans des fenêtres.

Gestion des zones de sécurité Android avec react-native-safe-area-context. Plateau bord à bord lorsque la hauteur le permet, réduit sur les écrans très courts pour garder le chevalet et les commandes visibles. La géométrie du dépôt reste mesurée sur les vues natives après cette réorganisation. Les fenêtres de joker, de détail du score, de passage de téléphone et de résultat sont conservées.

39 tests de règles et de géométrie réussis ; TypeScript et lint réussis. Vérification visuelle et tactile de la nouvelle interface à effectuer sur le téléphone réel.

## Correction rendu natif et barre centrée

Espaces JSX explicites entre fragments et vues supprimés : ils étaient émis en chaînes de texte hors Text. Test de régression sur le JSX compilé ajouté. Icône de reprise remplacée par deux flèches verticales vers le bas. Barre en trois zones avec côtés de largeur égale pour centrer géométriquement le bouton d’envoi. TypeScript et lint réussis ; 40 tests passent.

## Espaces autour du plateau

Au-dessus : chevalet adverse réduit à des dos de tuiles, avec le nombre exact de lettres du joueur opposé au joueur courant ; aucune valeur ni lettre adverse n’est rendue dans ce chevalet. Au-dessous : dernier coup en pastille compacte (joueur, mots ou passe/échange, points), ouvrant l’historique au toucher. Zone inférieure réduite avant le premier coup. TypeScript, lint et régression du texte natif vérifiés.

## Tuiles bois personnalisées

Images utilisateur copiées telles quelles dans assets/tile-front.png et assets/tile-back.png (PNG avec transparence). TileFace est partagé entre les dos adverses, le chevalet courant, le mode échange, les lettres du plateau et la tuile de déplacement. Les deux chevalets utilisent une taille carrée calculée commune et le même espacement. Le carré déplacé est agrandi et conserve son point de prise.

Lettre et valeur sont ajoutées dynamiquement en brun, avec typographie serif grasse et léger reflet décalé pour simuler une gravure. Le joker vaut zéro ; sa lettre affectée est conservée sur le plateau. Les marges transparentes du PNG sont compensées dans le rendu, sans modifier les images d’origine. Les faces cachées ne reçoivent pas de lettre.

41 tests passent ; contrôle de texte natif étendu à DraggableTile et TileFace ; géométrie du chevalet carré testée avec moins de sept lettres. TypeScript, lint et export Android réussis. Rendu du bois et du relief à confirmer sur l’appareil réel.

## Nouvelle face avant et récupération des lettres

Face avant remplacée par le nouveau PNG fourni, sous assets/tile-front-v2.png pour renouveler la référence de cache native. Récupération centralisée pour le bouton, le toucher et le dépôt au chevalet ; sélection, joker en attente et état de déplacement nettoyés. Les cases du chevalet sont remontées lorsqu’elles passent de vide à occupé pour réinitialiser leurs vues et leurs gestionnaires natifs.

La position du chevalet est remesurée au relâchement, avec protection contre les callbacks d’un geste ancien. Un test de rendu React a reproduit un échec du dépôt lorsque le chevalet change de position après la prise, puis vérifié sa correction. Il couvre aussi le bouton de récupération et le toucher d’une lettre du brouillon. 42 tests passent ; TypeScript et lint réussis. Ce test simule les vues et mesures natives ; le comportement sur le téléphone reste à confirmer.
