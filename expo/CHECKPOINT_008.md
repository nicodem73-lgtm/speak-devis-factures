# CHECKPOINT_008 - Point de restauration

**Date:** 2026-01-29

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
└── einvoice.ts

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
└── einvoice.ts

utils/
├── pdfGenerator.ts
├── deliveryNotePdf.ts
├── nlu.ts
├── notifications.ts
├── validation.ts
├── addressApi.ts
├── einvoiceProvider.ts
├── einvoicingService.ts
└── facturx.ts

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

## Modifications depuis CHECKPOINT_007

### Bons de livraison (Delivery Notes)

1. **Création de bons de livraison**
   - Formulaire avec émetteur pré-rempli depuis les paramètres entreprise
   - Sélection de client et produits
   - Génération automatique du numéro de BL

2. **Actions sur les bons de livraison**
   - Enregistrement en PDF
   - Envoi par email
   - Impression
   - Réimpression même après envoi

3. **Affichage PDF**
   - Émetteur à gauche, Destinataire à droite (convention française)
   - Format professionnel avec logo entreprise

4. **Filtre BL dans Documents**
   - Ajout du bouton "BL" aux filtres (Tous, Devis, Factures, BL)

### Liaison version automatique

1. **Version dans Paramètres**
   - La version affichée dans Paramètres est maintenant liée à app.json
   - Utilisation de `expo-constants` pour récupérer la version dynamiquement
   - Mise à jour automatique dans toute l'app

## Notes techniques importantes

- Les informations émetteur des BL sont pré-remplies depuis les paramètres entreprise
- La génération PDF des BL utilise `utils/deliveryNotePdf.ts`
- Les bons de livraison peuvent être réimprimés/renvoyés même après envoi
- La version de l'app est centralisée dans `app.json` (version: "1.0.1")
- Les montants sont stockés en centimes pour la précision
- L'export des stats inclut les dépenses par catégorie
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

## Liens externes

- CGU: https://sites.google.com/view/niko-app/solutions/speak-devis-factures/cgu-speak-devis-factures
- RGPD: https://sites.google.com/view/niko-app/solutions/speak-devis-factures/rgpd-speak-devis-factures

---
*Ce checkpoint peut être utilisé comme référence pour restaurer l'état du projet si nécessaire.*
