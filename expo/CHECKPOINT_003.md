# CHECKPOINT_003 - Point de restauration

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
├── expenses.tsx (NOUVEAU)
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
└── expenses.ts (NOUVEAU)

providers/
└── DatabaseProvider.tsx

types/
├── client.ts
├── product.ts
├── document.ts
├── reminder.ts
├── voice.ts
└── expense.ts (NOUVEAU)

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
9. **Gestion des dépenses** - NOUVEAU (voir détails ci-dessous)

## Modifications depuis CHECKPOINT_002

### Nouveautés

1. **Module Dépenses (expenses.tsx)**
   - Page dédiée à la gestion des dépenses professionnelles
   - Accessible depuis le Dashboard via icône €
   - Saisie manuelle des dépenses avec les champs :
     - Marchand (merchant)
     - Montant TTC (avec support virgule et point pour décimales)
     - TVA calculée automatiquement
     - Date modifiable manuellement (format français JJ-MM-AAAA)
     - Catégorie avec liste prédéfinie
   - Catégories disponibles :
     - Restaurant, Carburant, Fourniture, Loyer, Péages
     - Parkings, Assurance, Entretien, Frais de déplacement
     - Internet, Forfait mobile, Foire, Formations, Divers
   - Interface avec liste de catégories en grille (meilleure lisibilité)
   - Analyse de tickets par IA (photo) avec stockage OCR
   - Stockage en centimes (amount_ttc_cents, vat_amount_cents)

2. **Base de données dépenses (db/expenses.ts)**
   - Table expenses avec colonnes :
     - id, merchant, amount_ttc_cents, vat_amount_cents
     - category, date, photo_uri, ocr_text
     - created_at, updated_at
   - Fonctions CRUD complètes

3. **Types dépenses (types/expense.ts)**
   - Interface Expense avec tous les champs
   - Types pour création et mise à jour

4. **Améliorations UI**
   - Icône € au lieu de $ pour les dépenses
   - Date par défaut = date du jour
   - Format de date français (JJ-MM-AAAA)
   - Sélection de catégorie en grille avec boutons

## Notes importantes

- Les factures marquées comme "payées" ne peuvent plus être supprimées
- Les devis associés à des factures payées ne peuvent plus être supprimés
- Export PDF/Word des stats inclut les graphiques (capture d'écran)
- Recherche phonétique (Soundex) pour la correspondance des noms de clients
- Boutons remontés pour compatibilité Android (SafeAreaView)
- Nouveaux produits créés via "ligne libre" sont persistés dans la base produits
- Montants des dépenses stockés en centimes pour précision
- Support des décimales avec virgule et point dans le montant TTC

## Dépendances clés

- Expo SDK 54
- expo-sqlite
- expo-file-system (API legacy pour compatibilité)
- expo-sharing
- expo-print
- expo-linking (pour liens externes CGU/RGPD)
- expo-constants (pour version app)
- expo-image-picker (pour photos de tickets)
- react-native-view-shot (pour capture des graphiques)
- lucide-react-native

## Liens externes

- CGU: https://sites.google.com/view/niko-app/solutions/speak-devis-factures/cgu-speak-devis-factures
- RGPD: https://sites.google.com/view/niko-app/solutions/speak-devis-factures/rgpd-speak-devis-factures

---
*Ce checkpoint peut être utilisé comme référence pour restaurer l'état du projet si nécessaire.*
