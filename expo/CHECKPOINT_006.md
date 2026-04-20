# CHECKPOINT_006 - Point de restauration

**Date:** 2026-01-27

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
9. **Gestion des dépenses** - Avec dépenses récurrentes, archivage et OCR

## Modifications depuis CHECKPOINT_005

### Amélioration des champs de date (Nouveau devis / Nouvelle facture)

1. **Format de date standardisé AAAA-MM-JJ**
   - Les champs Date et Échéance utilisent le format ISO (YYYY-MM-DD)
   - Conversion automatique des formats français (JJ-MM-AAAA, JJMMAAAA)
   - Validation et normalisation automatique à la saisie

2. **Relation avec les relances impayés**
   - Date et échéance correctement liées aux paramètres de relances
   - Calcul automatique de l'échéance basé sur les paramètres

### Amélioration des champs Prix HT

1. **Support des décimales**
   - Le champ Prix HT accepte maintenant le point (.) et la virgule (,)
   - Conversion automatique pour les centimes
   - Validation correcte des montants décimaux

### Correction de l'analyse IA des dépenses

1. **Correction de l'erreur JSON Parse**
   - Résolution de l'erreur "JSON Parse error: Unexpected character: R"
   - Meilleure gestion des réponses IA avec parsing sécurisé
   - Fallback en cas d'échec de parsing

### Amélioration de l'export de sauvegarde

1. **Inclusion des dépenses dans l'export**
   - L'export de la base de données inclut maintenant les dépenses
   - Toutes les données (clients, produits, documents, dépenses) sont exportées

### Amélioration de la reconnaissance OCR des tickets

1. **Optimisation de la capture caméra**
   - Amélioration de la qualité d'image pour l'OCR
   - Meilleure gestion des conditions de luminosité
   - Réduction des échecs de reconnaissance

### Correction des dépenses récurrentes

1. **Gestion de la suppression partielle**
   - Correction du bug lors de la suppression de mois individuels
   - La modification de la date de fin fonctionne correctement
   - Les mois récurrents sont correctement régénérés

## Notes techniques importantes

- Les dépenses récurrentes sont créées toutes en une fois lors de l'enregistrement
- La comparaison de dates utilise le format ISO (YYYY-MM-DD) pour garantir un tri correct
- L'archivage supprime les fichiers photos du système de fichiers pour libérer de l'espace
- Les montants sont stockés en centimes (`amount_ttc_cents`, `amount_tva_cents`) pour la précision
- L'export des stats inclut maintenant les dépenses par catégorie
- Le parsing JSON de l'IA est sécurisé avec try/catch et extraction de JSON valide

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
