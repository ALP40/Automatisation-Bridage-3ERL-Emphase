# Bridage 3ERL — Enphase Envoy-S Metered EU + Shelly

> Coupure automatique de l'injection solaire sur signal de prix négatif 3ERL,
> via un contact sec Shelly sur le port DRM de la passerelle Enphase.
> **Fonctionnement 100 % autonome — sans Home Assistant requis.**

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Platform: Shelly](https://img.shields.io/badge/Platform-Shelly%20Gen2%2FGen3-blue)
![Hardware: Enphase Envoy-S Metered EU](https://img.shields.io/badge/Hardware-Enphase%20Envoy--S%20Metered%20EU-orange)
![Firmware: d8.3.5528](https://img.shields.io/badge/Firmware-d8.3.5528-green)
![HA: Optionnel](https://img.shields.io/badge/Home%20Assistant-Optionnel-lightgrey)

---

## Sommaire

- [Contexte](#contexte)
- [Matériel](#matériel)
- [Architecture](#architecture)
- [Fichiers du projet](#fichiers-du-projet)
- [Installation](#installation)
  - [1. Passerelle Enphase Enlighten Manager](#1-passerelle-enphase-enlighten-manager)
  - [2. Câblage Shelly → Envoy](#2-câblage-shelly--envoy)
  - [3. Script Shelly (mode autonome)](#3-script-shelly-mode-autonome)
  - [4. Home Assistant (optionnel)](#4-home-assistant-optionnel)
- [API 3ERL](#api-3erl)
- [Logique de bridage](#logique-de-bridage)
  - [Mode ACI](#mode-aci)
  - [Mode ACC](#mode-acc)
- [Crédits](#crédits)

---

## Contexte

### Qu'est-ce que 3ERL ?

[3ERL](https://3erl.fr) est une **association loi 1901** qui joue le rôle de
**Responsable d'Équilibre** sur le marché de l'électricité français. Elle permet
aux particuliers en autoconsommation de vendre leur surplus solaire au **prix du
marché spot (PRE+)** plutôt qu'au tarif fixe d'EDF OA, sans abonnement ni frais
d'entrée — l'association se rémunère uniquement par une commission sur les gains
générés.

3ERL publie en temps réel une **API publique** (`https://3erl.fr/api.json`) qui
expose notamment un signal de bridage mis à jour toutes les 15 minutes, indiquant
aux producteurs quand il est déconseillé d'injecter sur le réseau.

### Pourquoi brider l'injection ?

En autoconsommation individuelle (**ACI**) avec 3ERL, la rémunération du
surplus injecté est calculée en **moyenne pondérée journalière** (champ `PRD4`).
Si cette moyenne devient négative en fin de journée — ce qui arrive lors des
pics de production solaire collective (printemps/été, milieu de journée) —
**tout le surplus injecté dans la journée est valorisé au prix négatif**.

3ERL publie un signal de bridage (`Bridage = 1`) pour indiquer quand ne pas
injecter. Ce projet automatise la coupure de l'injection via le port **DRM**
de la passerelle Enphase, piloté par un relais Shelly 1 Mini Gen3.

En autoconsommation collective (**ACC**), le champ `Bridage_CDC` est utilisé
à la place : la valorisation est au PRE+ du quart d'heure en cours.

---

## Matériel

| Composant | Modèle | Firmware / Version |
|---|---|---|
| Passerelle solaire | Enphase Envoy-S Metered EU | d8.3.5528 |
| Relais de commande | Shelly 1 Mini Gen3 (S3SW-001X8EU) | 1.7.5 |
| Domotique | Home Assistant | **Optionnel** — monitoring uniquement |

**Compatibilité Shelly**

Le scripting mJS nécessaire est disponible sur les modèles suivants :

| Modèle | Référence | Compatible |
|---|---|---|
| Shelly 1 Mini Gen3 | S3SW-001X8EU | ✅ |
| Shelly Plus 1 | SNSW-001X16EU | ✅ |
| Shelly Plus 1PM | SNSW-001P16EU | ✅ |
| Shelly Pro 1 (rail DIN) | SPSW-001XE16EU | ✅ |
| Shelly 1 Gen1 | SHSW-1 | ❌ pas de scripting |
| Shelly 1L Gen1 | SHSW-L | ❌ pas de scripting |

---

## Architecture

### Mode autonome (Shelly seul — recommandé)

```
┌─────────────────────────────────────────────────┐
│                  API 3ERL                       │
│          https://3erl.fr/api.json               │
│     Bridage / Bridage_CDC  (0 ou 1)             │
│     MAJ : :03, :18, :33, :48 chaque heure      │
└────────────────────┬────────────────────────────┘
                     │ HTTP GET toutes les 15 min
           ┌─────────▼──────────┐
           │  Shelly 1 Mini Gen3│  Script mJS autonome
           │  (script embarqué) │  Aucune dépendance externe
           └─────────┬──────────┘
                     │ Contact sec  I → 1/5  /  O → Com
           ┌─────────▼──────────┐
           │  Envoy-S Metered   │  Port DRM entrée numérique
           │  EU  d8.3.5528     │  Relay 1 : Com ↔ 1/5
           └─────────┬──────────┘
                     │ Signal DRM interne
           ┌─────────▼──────────┐
           │  Micro-onduleurs   │  Level 1 → 100 % export
           │  Enphase IQ8+      │  Level 2 → 0 % export (ACI)
           └────────────────────┘          talon % export (ACC)
```

### Avec Home Assistant (optionnel — monitoring)

```
Shelly autonome (bridage) ──────────────────────────────────┐
                                                            │
Home Assistant                                              │
  • REST sensor 3ERL (toutes les 15 min)                    │
  • Dashboard : PRE+, tendance, flux réseau                 │
  • Notifications mobile                                    │
  • Historique graphique 24h                                │
  • Override manuel (mode On / Off)          ──────────────►│
                                                            ▼
                                               switch.shelly_buanderie
```

---

## Fichiers du projet

```
.
├── README.md
│
├── shelly/
│   ├── shelly_3erl_aci.js          # Script autonome mode ACI
│   └── shelly_3erl_acc.js          # Script autonome mode ACC
│
├── home-assistant/                  # OPTIONNEL — monitoring uniquement
│   ├── packages/
│   │   └── 3erl_monitoring_simple.yaml
│   └── lovelace/
│       └── 3erl_dashboard_simple.yaml
│
└── docs/
    ├── tuto_bridage_3erl_aci.pdf   # Guide complet ACI
    └── tuto_bridage_3erl_acc.pdf   # Guide complet ACC
```

---

## Installation

### 1. Passerelle Enphase Enlighten Manager

> Compte **Installateur / DIY** requis. Contactez le support Enphase si vous
> avez un compte Propriétaire classique.

Chemin : **Appareils → Passerelle → Limiter la production via relais sur Port d'entrée numérique**

| Champ | Valeur |
|---|---|
| Cible de la limitation | **Exportation** |
| Valeur de référence | Capacité installée en AC [W] |
| Capacité maximale | Votre puissance AC en W |
| Nb paramètres de relais | 4 |
| Nb niveaux à régler | 2 |
| Limitation par défaut | 100 % |
| Vitesse de balayage | 1 000 W/sec |

**Configuration des niveaux :**

| Niveau | Relay 1 | Relay 2 | Relay 3 | Relay 4 | Limitation |
|---|---|---|---|---|---|
| Level 1 (normal) | 0 | 0 | 0 | 0 | 100 % |
| Level 2 — ACI | 1 | 0 | 0 | 0 | **0 %** |
| Level 2 — ACC | 1 | 0 | 0 | 0 | **~12 %** *(talon ACC)* |

> ⚠️ **Mode ACC — calcul du talon Level 2 :**
> ```
> % Level 2 = (talon_maison_W + talon_total_voisins_ACC_W) / puissance_AC_W × 100
> Exemple : (200 + 500) / votre_puissance_AC_W × 100 → arrondir au % supérieur
> ```

---

### 2. Câblage Shelly → Envoy

Les bornes **Com** et **1/5** de l'Envoy sont des entrées numériques basse
tension. **Ne jamais connecter du 230V sur ces bornes.**

```
Shelly 1 Mini Gen3         Envoy-S Metered EU
  Borne O (Output)  ────►  Borne Com
  Borne I (Input)   ────►  Borne 1/5  (Relay 1)

  Borne L / N       ────►  Alimentation 230V (circuit séparé)
```

**Comportement fail-safe :**

| État Shelly | Contact | Level Envoy | Export |
|---|---|---|---|
| OFF (repos) | Ouvert | Level 1 | **100 %** ✅ |
| ON | Fermé | Level 2 | 0 % ou talon % |

> En cas de panne Shelly, coupure wifi ou arrêt réseau : contact reste ouvert
> → retour automatique export normal. **Jamais bloqué en bridage.**

---

### 3. Script Shelly (mode autonome)

Le script tourne **directement sur le Shelly**, sans aucune dépendance
externe. Il interroge l'API 3ERL et pilote son propre relais.

**Choisir le bon script :**

| Script | Mode | Champ API | Level 2 |
|---|---|---|---|
| `shelly_3erl_aci.js` | ACI | `Bridage` | 0 % |
| `shelly_3erl_acc.js` | ACC | `Bridage_CDC` | talon % |

**Déploiement (2 minutes) :**

```
1. Ouvrir http://[IP_du_Shelly] dans un navigateur
2. Scripts → Créer un nouveau script
3. Nom : "3ERL-Bridage-ACI"  (ou ACC)
4. Coller le contenu du fichier .js
5. Sauvegarder
6. Activer "Lancer au démarrage"
7. Cliquer Démarrer → vérifier les logs
```

**Logs attendus :**
```
[3ERL-ACI] Démarrage script bridage ACI — Relay ID=0
[3ERL-ACI] Interrogation API 3ERL...
[3ERL-ACI] Bridage=0 | PRE+=12.4 EUR/MWh | PRD4=38.2 EUR/MWh | MAJ=21/07/2026 14:18
[3ERL-ACI] Pas de changement (Bridage=0)
```

**Calendrier d'interrogation :**

```
3ERL publie aux minutes  : :03, :18, :33, :48
Script interroge aux     : :04, :19, :34, :49  (marge 1 min)
Retry si données absentes: toutes les minutes
User-Agent envoyé        : Shelly/3ERL-Zero-Inject-ACI
```

---

### 4. Home Assistant (optionnel)

HA n'est **pas requis** pour le bridage. Il ajoute uniquement :
- Dashboard de monitoring (PRE+, flux réseau, état relais)
- Notifications mobiles lors des changements d'état
- Historique graphique sur 24h
- Override manuel (forcer ON/OFF sans modifier le script)

**Prérequis :** déclarer le dossier `packages/` dans `configuration.yaml` :

```yaml
homeassistant:
  packages: !include_dir_named packages
```

**Déploiement :**
1. Copier `3erl_monitoring_simple.yaml` dans `/config/packages/`
2. Redémarrer Home Assistant
3. Ajouter la carte `3erl_dashboard_simple.yaml` dans Lovelace

---

## API 3ERL

| Propriété | Valeur |
|---|---|
| URL | `https://3erl.fr/api.json` |
| Authentification | Aucune (publique) |
| User-Agent | **Requis** par l'hébergeur |
| Fréquence MAJ | Minutes :03, :18, :33, :48 |

**Champs principaux :**

```json
{
  "Bridage": 1,             // ACI : 0 = libre / 1 = bridage
  "Bridage_CDC": 1,         // ACC : 0 = libre / 1 = bridage
  "Dernier_PREP": -6.6,     // Dernier PRE+ en €/MWh
  "PRD4": 41.71,            // Estimation journalière pondérée €/MWh
  "Heure_Update": "04/07/2026 17:15",
  "PREP_Profile": "1-",     // Tendance : 3+/2+/1+/0/1-/2-/3-
  "Bridage_Long_Terme": 14  // Heure avant laquelle ne pas injecter
}
```

---

## Logique de bridage

### Mode ACI

```
Toutes les 15 min :
  Si Bridage = 1  → Shelly ON  → Level 2 → export 0 %
  Si Bridage = 0  → Shelly OFF → Level 1 → export 100 %
```

La rémunération est la **moyenne pondérée journalière** (PRD4).
Si PRD4 est négatif en fin de journée, tout le surplus injecté
dans la journée est valorisé au prix négatif.

### Mode ACC

```
Toutes les 15 min :
  Si Bridage_CDC = 1  → Shelly ON  → Level 2 → export limité au talon %
  Si Bridage_CDC = 0  → Shelly OFF → Level 1 → export 100 %
```

La valorisation est au **PRE+ du quart d'heure en cours**.
Le talon % maintient la consommation minimale des voisins ACC
même pendant les périodes de bridage.

---

## Crédits

- **3ERL** — [https://3erl.fr](https://3erl.fr) — API publique de bridage
- **Mathieu Carbou** — [https://github.com/mathieucarbou](https://github.com/mathieucarbou) — [gist original](https://gist.github.com/mathieucarbou/8d83d25247821e85a693dea61fe4f0d2) dont ce projet est adapté
- **Enphase** — [https://enphase.com](https://enphase.com) — Documentation Envoy-S Metered EU, port DRM
- **SiSol** — [https://sisol.fr](https://sisol.fr) — Plateforme d'autoconsommation collective (ACC)
- **Shelly** — [https://shelly.com](https://shelly.com) — Shelly 1 Mini Gen3, scripting mJS

---

## Licence

MIT — Utilisation libre, sans garantie.
Ce projet n'est pas affilié à 3ERL, Enphase ou Shelly.
