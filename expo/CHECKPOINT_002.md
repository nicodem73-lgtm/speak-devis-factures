# CHECKPOINT_002 - Point de restauration

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

## Modifications depuis CHECKPOINT_001

### Nouveautés

1. **Page Information (A PROPOS)** - Remplace la page Roadmap
   - Version de l'application affichée
   - Lien vers les CGU (Conditions Générales d'Utilisation)
   - Lien vers la Politique de confidentialité (RGPD)

2. **Modèles PDF** - Aperçu visuel des templates
   - Prévisualisation des modèles disponibles (Classique, Moderne, Minimaliste)
   - L'utilisateur peut voir les différences entre les modèles avant de choisir

3. **Création de devis améliorée**
   - Formulaire client complet lors de la création d'un nouveau client depuis un devis
   - Les produits créés en "ligne libre" sont automatiquement ajoutés à la liste des produits

## Notes importantes

- Les factures marquées comme "payées" ne peuvent plus être supprimées
- Les devis associés à des factures payées ne peuvent plus être supprimés
- Export PDF/Word des stats inclut les graphiques (capture d'écran)
- Recherche phonétique (Soundex) pour la correspondance des noms de clients
- Boutons remontés pour compatibilité Android (SafeAreaView)
- Nouveaux produits créés via "ligne libre" sont persistés dans la base produits

## Dépendances clés

- Expo SDK 54
- expo-sqlite
- expo-file-system
- expo-sharing
- expo-print
- expo-linking (pour liens externes CGU/RGPD)
- expo-constants (pour version app)
- react-native-view-shot (pour capture des graphiques)
- lucide-react-native

## Liens externes

- CGU: https://sites.google.com/view/niko-app/solutions/speak-devis-factures/cgu-speak-devis-factures
- RGPD: https://sites.google.com/view/niko-app/solutions/speak-devis-factures/rgpd-speak-devis-factures

---
*Ce checkpoint peut être utilisé comme référence pour restaurer l'état du projet si nécessaire.*
