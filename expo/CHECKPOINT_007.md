# CHECKPOINT_007 - Point de restauration

**Date:** 2026-01-29

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

## Modifications depuis CHECKPOINT_006

### Simplification de la configuration iOS

1. **Suppression des application-groups**
   - Retrait de la configuration `associatedDomains` avec `group.app.rork.speakdevisfactures`
   - Conservation uniquement de `usesIcloudStorage: true` pour iCloud
   - Résolution de l'erreur de prebuild liée aux groupes d'applications

2. **Suppression de notification_sound.wav**
   - Retrait de la référence au fichier audio personnalisé inexistant
   - Correction de l'erreur: `ENOENT: no such file or directory, copyfile 'notification_sound.wav'`
   - Les notifications utilisent maintenant le son système par défaut

### Configuration app.json actuelle (iOS)

```json
{
  "ios": {
    "supportsTablet": false,
    "bundleIdentifier": "app.rork.speakdevisfactures",
    "usesIcloudStorage": true,
    "infoPlist": {
      "UIBackgroundModes": ["audio"],
      "NSMicrophoneUsageDescription": "...",
      "NSPhotoLibraryUsageDescription": "...",
      "NSCameraUsageDescription": "..."
    }
  }
}
```

## Notes techniques importantes

- Les dépenses récurrentes sont créées toutes en une fois lors de l'enregistrement
- La comparaison de dates utilise le format ISO (YYYY-MM-DD) pour garantir un tri correct
- L'archivage supprime les fichiers photos du système de fichiers pour libérer de l'espace
- Les montants sont stockés en centimes (`amount_ttc_cents`, `amount_tva_cents`) pour la précision
- L'export des stats inclut maintenant les dépenses par catégorie
- Le parsing JSON de l'IA est sécurisé avec try/catch et extraction de JSON valide
- iCloud Storage activé sans application-groups (non nécessaire pour cette app)

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
- expo-document-picker (avec iCloud Production)
- expo-notifications
- expo-av (pour microphone)
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
