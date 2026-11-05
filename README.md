# Shop-Racing · Historique Audio

## Modifier le projet

Le code à modifier se trouve dans **src/**. **archives.js est généré** et reste le fichier chargé par le portail. Il doit être publié avec les modifications sources.

Prérequis : Node.js 20 ou supérieur. Aucune dépendance à installer.

```sh
npm run build
npm test
npm run check
```

Après validation, faire Commit puis Push dans GitHub Desktop. Inclure les sources ET archives.js. Le champ script OEM conserve son URL actuelle.

## Où intervenir

| Dossier / fichier | Responsabilité |
| --- | --- |
| src/config.js | Version et limites mémoire |
| src/utils.js | Dates, noms, licences, correspondance heure / position |
| src/api/ | Capture de session, requêtes, pagination et chargement |
| src/portal/controls.js | Sélecteur de groupes, calendrier et bouton Query du portail |
| src/ui/ | Fenêtre, menus, tableau et styles.css |
| src/audio/player.js | Lecture et frise chronologique |
| src/exports/ | ZIP, WAV, fusion et téléchargements |
| src/runtime/ | État, déconnexion et démarrage |
| tests/ | Tests locaux avec données fictives |
| scripts/ | Assemblage et ordre des sources |

## Architecture

Les fichiers sources sont assemblés dans une fermeture JavaScript privée unique. Ils partagent les variables déclarées dans runtime/state.js et les fonctions des autres fichiers : ce ne sont pas des modules ES indépendants. Les petites déclarations d’état propres à une fonctionnalité restent près de cette fonctionnalité. L’ordre explicite se trouve dans scripts/sources.json. Les fonctions sont disponibles par leur nom dans cette fermeture ; rien n’est ajouté à window hormis le marqueur de montage existant.

Ce choix conserve le démarrage synchrone des interceptions XHR, le script OEM unique et le fonctionnement sans chargement de modules supplémentaires. Le CSS est incorporé au build pour le Shadow DOM. Les commentaires Source dans archives.js permettent de retrouver le fichier à modifier. Ne pas modifier directement le fichier généré.

Flux principal : démarrage → ouverture de la fenêtre → groupes du sélecteur utilisateur → synchronisation groupe/date → Query natif → capture de session → pages audio → tableau et lecture/export.

## Contrats à préserver

- Les groupes accessibles proviennent uniquement du sélecteur audio de l’utilisateur. Ne pas utiliser une liste globale de société pour compléter ce périmètre. Vérifier également le périmètre avant une recherche.
- Réutiliser la méthode audio capturée et ses paramètres ; ne pas remplacer getByUser par get. Conserver start_time et la session en mémoire.
- La pagination audio commence à zéro ; pageSize représente le nombre de pages.
- La date doit être validée dans le modèle du calendrier natif, pas seulement dans son champ texte.
- Aucun identifiant ni session dans les sources, tests, logs ou stockage persistant. Seuls les libellés personnalisés sont conservés localement.
- Déconnexion : annuler les requêtes, effacer les données et révoquer les fichiers temporaires.
- Un export partiel doit rester annoncé comme partiel ; ne jamais annoncer un téléchargement terminé à la création du fichier.
- La frise concatène les enregistrements sans silence et traduit sa position en heure d’origine.

## Vérification avant publication

Les tests vérifient les formats, la pagination, les groupes autorisés, la déconnexion, les contrôles natifs simulés, la lecture et les exports. Ils ne remplacent pas une vérification sur le portail réel : tester un compte sans licence, un compte avec licence, la sélection date/groupe, la navigation dans la frise et la déconnexion. Aucun accès à un compte réel n’est nécessaire pour lancer npm test.
