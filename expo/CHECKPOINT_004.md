# CHECKPOINT_004 - Point de restauration

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
5. **Statistiques** - Dashboard avec export PDF et Word (incluant graphiques)
6. **Paramètres** - Entreprise, numérotation, taxes, modèles, rappels, sauvegardes
7. **Recherche globale** - Recherche dans clients, produits et documents
8. **Protection des factures payées** - Suppression bloquée pour factures payées et devis associés
9. **Gestion des dépenses** - Avec dépenses récurrentes

## Modifications depuis CHECKPOINT_003

### Dépenses récurrentes (AMÉLIORÉ)

1. **Génération automatique des instances récurrentes**
   - Lors de la création d'une dépense récurrente, toutes les instances sont générées immédiatement
   - Chaque mois entre la date de début et la date de fin reçoit sa propre dépense
   - Le jour de récurrence est conservé (ajusté si le mois a moins de jours)
   - Les dépenses récurrentes partagent un `recurring_parent_id` commun

2. **Format de date unifié**
   - Toutes les dates utilisent le format ISO `YYYY-MM-DD` en base de données
   - L'affichage utilise le format français `JJ/MM/AAAA`
   - Normalisation automatique des formats de saisie (JJ-MM-AAAA, JJ/MM/AAAA, JJMMAAAA)
   - Conversion automatique lors de la saisie

3. **Champs de date modifiables**
   - Les champs de date (début récurrence, fin récurrence, date dépense) sont éditables
   - Support du DateTimePicker natif sur mobile
   - Fallback avec modal de saisie sur web

4. **Structure de données récurrentes**
   - `is_recurring`: flag indiquant une dépense récurrente (0 ou 1)
   - `recurring_start_date`: date de début de la récurrence (YYYY-MM-DD)
   - `recurring_end_date`: date de fin de la récurrence (YYYY-MM-DD)
   - `recurring_day`: jour du mois pour la récurrence
   - `recurring_parent_id`: identifiant de groupe pour lier les instances

5. **Filtrage par mois**
   - Les dépenses s'affichent uniquement pour le mois sélectionné
   - Les dépenses récurrentes apparaissent dans chaque mois de leur plage
   - Navigation mois par mois avec boutons précédent/suivant

## Notes techniques importantes

- Les dépenses récurrentes ne sont plus générées "à la volée" mais créées toutes en une fois lors de l'enregistrement
- La comparaison de dates utilise le format ISO (YYYY-MM-DD) pour garantir un tri correct
- L'itération mois par mois utilise une approche année/mois pour éviter les bugs de `setMonth()`
- Les montants sont stockés en centimes (`amount_ttc_cents`, `amount_tva_cents`) pour la précision

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
