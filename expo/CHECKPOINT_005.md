# CHECKPOINT_005 - Point de restauration

**Date:** 2026-01-26

## État du projet

### Structure des fichiers principaux

```
app/
├── (tabs)/
│   ├── _layout.tsx
│   ├── index.tsx (Dashboard)
│   ├── clients.tsx
│   ├── products.tsx
│   ├── search.tsx
│   └── stats.tsx
├── client/
│   ├── [id].tsx
│   ├── new.tsx
│   └── edit/[id].tsx
├── product/
│   ├── [id].tsx
│   ├── new.tsx
│   └── edit/[id].tsx
├── document/
│   ├── [id].tsx
│   ├── new.tsx
│   └── edit/[id].tsx
├── settings/
│   ├── company.tsx
│   ├── numbering.tsx
│   ├── taxes.tsx
│   ├── templates.tsx
│   ├── backup.tsx
│   ├── reminders.tsx
│   └── information.tsx
├── _layout.tsx
├── modal.tsx
├── settings.tsx
├── expenses.tsx
└── +not-found.tsx

components/
├── ClientForm.tsx
├── ProductForm.tsx
├── ProductSelector.tsx
├── VoiceCommand.tsx
├── EmptyState.tsx
├── Toast.tsx
└── FormInput.tsx

db/
├── index.ts
├── database.ts
├── schema.ts
├── clients.ts
├── products.ts
├── documents.ts
├── settings.ts
├── reminders.ts
└── expenses.ts

providers/
└── DatabaseProvider.tsx

types/
├── client.ts
├── product.ts
├── document.ts
├── reminder.ts
├── voice.ts
└── expense.ts

utils/
├── pdfGenerator.ts
├── nlu.ts
├── notifications.ts
├── validation.ts
└── addressApi.ts

constants/
└── colors.ts
```

## Fonctionnalités implémentées

1. **Gestion des clients** - CRUD complet avec recherche phonétique
2. **Gestion des produits** - CRUD complet
3. **Gestion des documents** - Devis et factures avec conversion
4. **Commandes vocales** - NLU avec recherche phonétique (Soundex)
5. **Statistiques** - Dashboard avec export PDF et Word (incluant graphiques et dépenses)
6. **Paramètres** - Entreprise, numérotation, taxes, modèles, rappels, sauvegardes
7. **Recherche globale** - Recherche dans clients, produits et documents
8. **Protection des factures payées** - Suppression bloquée pour factures payées et devis associés
9. **Gestion des dépenses** - Avec dépenses récurrentes et archivage

## Modifications depuis CHECKPOINT_004

### Intégration des dépenses dans Stats

1. **Affichage des dépenses en temps réel**
   - Nouveau segment "Dépenses" dans l'onglet Stats
   - Affichage par mois et par année
   - Répartition par catégorie avec graphique en barres
   - Icône € pour les dépenses (au lieu de $)

2. **Détail des dépenses par catégorie**
   - Liste complète des catégories avec montants
   - Total des dépenses pour la période sélectionnée
   - Synchronisation en temps réel avec les données de dépenses

3. **Sélection d'années antérieures**
   - Possibilité de choisir n'importe quelle année (pas seulement l'année en cours)
   - Navigation année par année pour consulter l'historique

### Export des Stats avec Dépenses

1. **Export PDF amélioré**
   - Intégration des dépenses dans l'export PDF
   - Détail par catégorie inclus dans le rapport
   - Total des dépenses par période

2. **Export Word amélioré**
   - Même intégration des dépenses que pour le PDF
   - Format cohérent avec le reste du rapport

### Archivage des dépenses

1. **Fonction d'archivage par mois**
   - Bouton "Archiver" disponible pour chaque mois
   - Conservation de la dépense avec `is_archived=1`
   - Suppression des photos associées (`photo_uri` mis à NULL)
   - Allègement de la base de données

2. **Indicateur visuel d'archivage**
   - Icône V vert (CheckCircle) pour les dépenses archivées
   - Distinction claire entre dépenses actives et archivées

## Notes techniques importantes

- Les dépenses récurrentes sont créées toutes en une fois lors de l'enregistrement
- La comparaison de dates utilise le format ISO (YYYY-MM-DD) pour garantir un tri correct
- L'archivage supprime les fichiers photos du système de fichiers pour libérer de l'espace
- Les montants sont stockés en centimes (`amount_ttc_cents`, `amount_tva_cents`) pour la précision
- L'export des stats inclut maintenant les dépenses par catégorie

## Dépendances clés

- Expo SDK 54
- expo-sqlite
- expo-file-system (API legacy pour compatibilité)
- expo-sharing
- expo-print
- expo-linking (pour liens externes CGU/RGPD)
- expo-constants (pour version app)
- expo-image-picker (pour photos de tickets)
- expo-mail-composer (pour envoi par email)
- @react-native-community/datetimepicker
- @rork-ai/toolkit-sdk (pour OCR des tickets)
- react-native-view-shot (pour capture des graphiques)
- lucide-react-native
- zod

## Catégories de dépenses

- Restaurant, Carburant, Fourniture, Loyer, Péages
- Parkings, Assurance, Entretien, Frais de déplacement
- Internet, Forfait mobile, Foire, Formations, Divers

## Liens externes

- CGU: https://sites.google.com/view/niko-app/solutions/speak-devis-factures/cgu-speak-devis-factures
- RGPD: https://sites.google.com/view/niko-app/solutions/speak-devis-factures/rgpd-speak-devis-factures

---
*Ce checkpoint peut être utilisé comme référence pour restaurer l'état du projet si nécessaire.*
