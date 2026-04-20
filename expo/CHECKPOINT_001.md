# CHECKPOINT_001 - Point de restauration

**Date:** 2026-01-16

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
│   └── roadmap.tsx
├── _layout.tsx
├── modal.tsx
├── settings.tsx
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
└── reminders.ts

providers/
└── DatabaseProvider.tsx

types/
├── client.ts
├── product.ts
├── document.ts
├── reminder.ts
└── voice.ts

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
5. **Statistiques** - Dashboard avec export PDF et Word (incluant graphiques)
6. **Paramètres** - Entreprise, numérotation, taxes, modèles, rappels, sauvegardes
7. **Recherche globale** - Recherche dans clients, produits et documents
8. **Protection des factures payées** - Suppression bloquée pour factures payées et devis associés

## Notes importantes

- Les factures marquées comme "payées" ne peuvent plus être supprimées
- Les devis associés à des factures payées ne peuvent plus être supprimés
- Export PDF/Word des stats inclut les graphiques (capture d'écran)
- Recherche phonétique (Soundex) pour la correspondance des noms de clients
- Boutons remontés pour compatibilité Android (SafeAreaView)

## Dépendances clés

- Expo SDK 54
- expo-sqlite
- expo-file-system
- expo-sharing
- expo-print
- react-native-view-shot (pour capture des graphiques)
- lucide-react-native

---
*Ce checkpoint peut être utilisé comme référence pour restaurer l'état du projet si nécessaire.*
