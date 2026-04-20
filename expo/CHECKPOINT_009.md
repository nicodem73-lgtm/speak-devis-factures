# CHECKPOINT_009 - Point de restauration

**Date:** 2026-02-02

## État du projet

### Version actuelle
- Version: 1.0.1 (définie dans app.json)

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
├── delivery-notes/
│   ├── [id].tsx
│   ├── new.tsx
│   ├── index.tsx
│   └── edit/[id].tsx
├── settings/
│   ├── company.tsx
│   ├── numbering.tsx
│   ├── taxes.tsx
│   ├── templates.tsx
│   ├── backup.tsx
│   ├── reminders.tsx
│   ├── archive.tsx
│   └── information.tsx
├── _layout.tsx
├── modal.tsx
├── settings.tsx
└── expenses.tsx

components/
├── ClientForm.tsx
├── ProductForm.tsx
├── ProductSelector.tsx
├── VoiceCommand.tsx
├── EmptyState.tsx
├── Toast.tsx
├── FormInput.tsx
└── EInvoiceTimeline.tsx

db/
├── index.ts
├── database.ts
├── schema.ts
├── clients.ts
├── products.ts
├── documents.ts
├── deliveryNotes.ts
├── settings.ts
├── reminders.ts
├── expenses.ts
├── einvoice.ts
├── migration.ts
├── multiYearDatabase.ts
└── yearClosing.ts

providers/
└── DatabaseProvider.tsx

types/
├── client.ts
├── product.ts
├── document.ts
├── deliveryNote.ts
├── reminder.ts
├── voice.ts
├── expense.ts
├── einvoice.ts
└── archive.ts

utils/
├── pdfGenerator.ts
├── deliveryNotePdf.ts
├── nlu.ts
├── notifications.ts
├── validation.ts
├── addressApi.ts
├── einvoiceProvider.ts
├── einvoicingService.ts
├── facturx.ts
├── archiveVault.ts
└── fileStorage.ts

constants/
└── colors.ts
```

## Fonctionnalités implémentées

1. **Gestion des clients** - CRUD complet avec recherche phonétique
2. **Gestion des produits** - CRUD complet
3. **Gestion des documents** - Devis et factures avec conversion
4. **Bons de livraison** - CRUD complet avec PDF, email et impression
5. **Commandes vocales** - NLU avec recherche phonétique (Soundex)
6. **Statistiques** - Dashboard avec export PDF et Word (incluant graphiques et dépenses)
7. **Paramètres** - Entreprise, numérotation, taxes, modèles, rappels, sauvegardes
8. **Recherche globale** - Recherche dans clients, produits et documents
9. **Protection des factures payées** - Suppression bloquée pour factures payées et devis associés
10. **Gestion des dépenses** - Avec dépenses récurrentes, archivage et OCR
11. **Facturation électronique** - Support Factur-X et timeline e-invoicing
12. **Archives annuelles** - Sauvegarde et purge par année avec gestion multi-bases

## Modifications depuis CHECKPOINT_008

### Gestion des dépenses multi-années

1. **Base de données par année**
   - Chaque année a sa propre base de données SQLite (expenses_YYYY.db)
   - Création automatique de la base lors de l'ajout d'une dépense sur une année antérieure
   - Les dépenses se calent sur le mois et l'année en cours par défaut

2. **Suppression des dépenses**
   - Correction du bug de suppression des dépenses
   - La suppression fonctionne maintenant correctement sur toutes les années

3. **Sauvegarde complète**
   - Les dépenses de l'année en cours sont incluses dans la sauvegarde complète
   - Export JSON des dépenses avec toutes les métadonnées

### Archives annuelles améliorées

1. **Séparation sauvegarde/purge**
   - Les années pour la sauvegarde et la purge sont distinctes
   - Possibilité de sauvegarder une année sans la purger

2. **Import d'archives**
   - Création automatique des tables nécessaires lors de l'import
   - Gestion robuste des erreurs avec fallback

3. **Gestion des connexions SQLite**
   - Correction des erreurs "Access to closed resource"
   - Utilisation de connexions indépendantes pour éviter les conflits
   - Fermeture propre des connexions après utilisation

### Corrections techniques

1. **Stabilité base de données**
   - Gestion améliorée des connexions SQLite
   - Évitement des conflits lors d'accès concurrents
   - Logs détaillés pour le debugging

2. **Migration des données**
   - Support des migrations pour les nouvelles colonnes
   - Création automatique des tables manquantes

## Notes techniques importantes

- Les dépenses utilisent des bases SQLite séparées par année (expenses_YYYY.db)
- La base principale (speakfacture.db) contient clients, produits, documents, paramètres
- L'archivage crée des fichiers ZIP contenant JSON + bases SQLite
- Les montants sont stockés en centimes pour la précision
- iCloud Storage activé pour les sauvegardes

## Dépendances clés

- Expo SDK 54
- expo-sqlite
- expo-file-system
- expo-sharing
- expo-print
- expo-linking
- expo-constants (pour version app)
- expo-image-picker
- expo-mail-composer
- expo-document-picker (iCloud Production)
- expo-notifications
- expo-av
- @react-native-community/datetimepicker
- @rork-ai/toolkit-sdk (pour OCR)
- react-native-view-shot
- lucide-react-native
- zod

## Catégories de dépenses

- Restaurant, Carburant, Fourniture, Loyer, Péages
- Parkings, Assurance, Entretien, Frais de déplacement
- Internet, Forfait mobile, Foire, Formations, Divers

## Structure des bases de données

### Base principale (speakfacture.db)
- clients, products, documents, document_items
- delivery_notes, delivery_note_items
- company_info, numbering_settings, tax_settings
- template_settings, reminders, einvoice_status

### Bases dépenses (expenses_YYYY.db)
- expenses (id, description, amount, category, date, etc.)
- Une base par année (expenses_2024.db, expenses_2025.db, expenses_2026.db, etc.)

## Liens externes

- CGU: https://sites.google.com/view/niko-app/solutions/speak-devis-factures/cgu-speak-devis-factures
- RGPD: https://sites.google.com/view/niko-app/solutions/speak-devis-factures/rgpd-speak-devis-factures

---
*Ce checkpoint peut être utilisé comme référence pour restaurer l'état du projet si nécessaire.*
