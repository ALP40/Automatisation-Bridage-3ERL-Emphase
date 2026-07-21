# Bridage 3ERL — Enphase Envoy-S Metered EU + Shelly Plus 1

> Coupure automatique de l'injection solaire sur signal de prix négatif 3ERL,
> via un contact sec Shelly Plus 1 sur le port DRM de la passerelle Enphase.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Platform: Home Assistant](https://img.shields.io/badge/Platform-Home%20Assistant-blue)
![Hardware: Enphase Envoy-S Metered EU](https://img.shields.io/badge/Hardware-Enphase%20Envoy--S%20Metered%20EU-orange)
![Firmware: d8.3.5528](https://img.shields.io/badge/Firmware-d8.3.5528-green)

---

## Sommaire

- [Contexte](#contexte)
- [Matériel](#matériel)
- [Architecture](#architecture)
- [Fichiers du projet](#fichiers-du-projet)
- [Installation](#installation)
  - [1. Passerelle Enphase Enlighten Manager](#1-passerelle-enphase-enlighten-manager)
  - [2. Câblage Shelly Plus 1 → Envoy](#2-câblage-shelly-plus-1--envoy)
  - [3. Script Shelly](#3-script-shelly)
  - [4. Package Home Assistant](#4-package-home-assistant)
- [API 3ERL](#api-3erl)
- [Logique de bridage](#logique-de-bridage)
  - [Mode ACI](#mode-aci)
  - [Mode ACC](#mode-acc)
  - [Priorité batterie Zendure](#priorité-batterie-zendure)
- [Dashboard Home Assistant](#dashboard-home-assistant)
- [Entités exposées](#entités-exposées)
- [Crédits](#crédits)

---

## Contexte

En autoconsommation individuelle (**ACI**) avec **3ERL**, la rémunération du
surplus injecté est calculée en **moyenne pondérée journalière** (champ `PRD4`).
Si cette moyenne devient négative en fin de journée — ce qui arrive lors des
pics de production solaire collective (printemps/été, milieu de journée) —
**tout le surplus injecté dans la journée est valorisé au prix négatif**, même
celui injecté le matin à prix positif.

3ERL publie un signal de bridage (`Bridage = 1`) pour indiquer quand ne pas
injecter. Ce projet automatise la coupure de l'injection via le port **DRM**
de la passerelle Enphase, piloté par un relais Shelly Plus 1.

En autoconsommation collective (**ACC**), le champ `Bridage_CDC` est utilisé
à la place : la valorisation est alors au PRE+ du quart d'heure en cours.

---

## Matériel

| Composant | Modèle | Firmware / Version |
|---|---|---|
| Passerelle solaire | Enphase Envoy-S Metered EU | d8.3.5528 |
| Micro-onduleurs | 16 × Enphase IQ8+ | — |
| Puissance installée | 16 × 405 Wc = 6.48 kWc | Réf. AC : 6 200 W |
| Relais de commande | Shelly Plus 1 | firmware récent |
| Stockage (optionnel) | Zendure SolarFlow 2400AC + AB3000X | — |
| Domotique | Home Assistant | 2024.x ou supérieur |
| Région | Landes (40), France | — |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        API 3ERL                             │
│              https://3erl.fr/api.json                       │
│         Bridage / Bridage_CDC  (0 ou 1)                     │
│         MAJ : :03, :18, :33, :48 chaque heure              │
└───────────────────┬─────────────────────────────────────────┘
                    │ HTTP GET (User-Agent requis)
          ┌─────────▼──────────┐
          │   Shelly Plus 1    │  Script autonome (mJS)
          │   (script local)   │  Interroge l'API toutes les 15 min
          └─────────┬──────────┘
                    │ Contact sec (bornes I → O)
          ┌─────────▼──────────┐
          │  Envoy-S Metered   │  Port DRM — entrée numérique
          │  EU  d8.3.5528     │  Relay 1 : Com ↔ 1/5
          └─────────┬──────────┘
                    │ Signal DRM interne
          ┌─────────▼──────────┐
          │  16 × IQ8+         │  Level 1 → 100 % export
          │  Micro-onduleurs   │  Level 2 → 0 % export (ACI)
          └────────────────────┘           ou talon % (ACC)

          ┌────────────────────────────────────────────────────┐
          │              Home Assistant                        │
          │  • REST sensor 3ERL (scan toutes les 15 min)      │
          │  • Binary sensor avec condition SOC batterie       │
          │  • Automations Shelly (Activer / Désactiver /      │
          │    Sécurité / Réévaluation SOC)                    │
          │  • Dashboard monitoring                            │
          └────────────────────────────────────────────────────┘
```

---

## Fichiers du projet

```
.
├── README.md
│
├── home-assistant/
│   ├── packages/
│   │   └── 3erl_zero_inject_adapte.yaml   # Package HA complet
│   └── lovelace/
│       └── 3erl_dashboard.yaml            # Carte dashboard
│
├── shelly/
│   ├── shelly_3erl_aci.js                 # Script Shelly mode ACI
│   └── shelly_3erl_acc.js                 # Script Shelly mode ACC
│
└── docs/
    ├── tuto_bridage_3erl_aci.pdf          # Guide installation ACI
    └── tuto_bridage_3erl_acc.pdf          # Guide installation ACC
```

---

## Installation

### 1. Passerelle Enphase Enlighten Manager

> Compte **Installateur / DIY** requis. Contactez le support Enphase si vous
> avez un compte Propriétaire classique.

Chemin : **Appareils → Passerelle → Limiter la production via relais sur Port d'entrée numérique**

| Champ | Valeur |
|---|---|
| Cible de la limitation | **Exportation** (pas Production) |
| Valeur de référence | Capacité installée en AC [W] |
| Capacité maximale | 6 200 W |
| Nb paramètres de relais | 4 |
| Nb niveaux à régler | 2 |
| Limitation par défaut | 100 % |
| Vitesse de balayage | 1 000 W/sec |

**Configuration des niveaux :**

| Niveau | Relay 1 | Relay 2 | Relay 3 | Relay 4 | Limitation |
|---|---|---|---|---|---|
| Level 1 (normal) | 0 | 0 | 0 | 0 | 100 % |
| Level 2 (bridage ACI) | 1 | 0 | 0 | 0 | **0 %** |
| Level 2 (bridage ACC) | 1 | 0 | 0 | 0 | **~12 %** *(voir calcul talon ACC)* |

> ⚠️ **Mode ACC uniquement** — Le Level 2 ne doit pas être à 0 %.
> Calculez le talon minimal à maintenir :
> ```
> % Level 2 = (talon_maison_W + talon_total_voisins_ACC_W) / puissance_AC_W × 100
> Exemple : (200 + 500) / 6200 × 100 = 11.3 % → arrondir à 12 %
> ```

---

### 2. Câblage Shelly Plus 1 → Envoy

Les bornes **Com** et **1/5 (Relay 1)** de l'Envoy sont des entrées numériques
basse tension. **Ne jamais y connecter du 230V.**

```
Shelly Plus 1          Envoy-S Metered EU
  Borne O    ────────►  Borne Com
  Borne I    ────────►  Borne 1/5 (Relay 1)
  Borne L/N  (alimentation 230V séparée)
```

**Comportement fail-safe :**

| État Shelly | Contact | Level Envoy | Export |
|---|---|---|---|
| OFF (repos) | Ouvert | Level 1 | **100 %** ✅ |
| ON | Fermé | Level 2 | 0 % ou talon % |

En cas de panne Shelly, coupure wifi ou arrêt HA : le contact reste ouvert →
retour automatique en export normal. Jamais bloqué en bridage.

---

### 3. Script Shelly

Le script s'exécute **directement sur le Shelly Plus 1**, de façon autonome
sans dépendance à Home Assistant pour la boucle de décision.

**Choisir le bon script :**

| Script | Mode | Champ API | Level 2 |
|---|---|---|---|
| `shelly_3erl_aci.js` | ACI | `Bridage` | 0 % |
| `shelly_3erl_acc.js` | ACC | `Bridage_CDC` | talon % |

**Déploiement :**

1. Ouvrir `http://[IP_du_Shelly]` dans un navigateur
2. **Scripts → Créer un nouveau script**
3. Nommer le script : `3ERL-Bridage-ACI` (ou `ACC`)
4. Coller le contenu du fichier `.js` correspondant
5. **Sauvegarder**
6. Activer **Lancer au démarrage** (Run on startup)
7. Cliquer **Démarrer** pour le tester immédiatement

**Calendrier d'interrogation :**

```
3ERL publie aux minutes  : :03, :18, :33, :48
Script interroge aux     : :05, :20, :35, :50  (marge 2 min)
Retry si données absentes: toutes les minutes  (indispo RTE)
User-Agent requis        : Shelly/3ERL-Zero-Inject-ACI (ou ACC)
```

---

### 4. Package Home Assistant

**Prérequis :** le dossier `packages/` doit être déclaré dans `configuration.yaml` :

```yaml
homeassistant:
  packages: !include_dir_named packages
```

**Déploiement :**

1. Copier `3erl_zero_inject_adapte.yaml` dans `/config/packages/`
2. Redémarrer Home Assistant
3. Vérifier dans **Outils de développement → États** que les entités apparaissent

**Entité Shelly à confirmer :**

Remplacer `switch.buanderie_shelly_emphase` par le nom réel de votre entité
(Paramètres → Intégrations → Shelly).

---

## API 3ERL

| Propriété | Valeur |
|---|---|
| URL | `https://3erl.fr/api.json` |
| Authentification | Aucune (publique) |
| User-Agent | **Requis** par l'hébergeur pour systèmes automatisés |
| Fréquence MAJ | Minutes :03, :18, :33, :48 |
| Format | JSON |

**Champs utilisés :**

```json
{
  "Bridage": 1,           // ACI : 0 = libre / 1 = bridage recommandé
  "Bridage_CDC": 1,       // ACC : 0 = libre / 1 = bridage recommandé
  "Dernier_PREP": -6.6,   // Dernier PRE+ en €/MWh
  "PRD4": 41.71,          // Estimation journalière pondérée en €/MWh
  "Heure_Update": "04/07/2026 17:15",
  "PREP_Profile": "1-",   // Tendance : 3+/2+/1+/0/1-/2-/3-
  "Bridage_Long_Terme": 14 // Heure avant laquelle ne pas injecter
}
```

---

## Logique de bridage

### Mode ACI

```
3ERL Bridage = 1
      ET
Batteries >= seuil SOC (défaut 95 %)
      ↓
Shelly ON → Level 2 → export 0 %
```

La rémunération est la **moyenne pondérée journalière** (PRD4). Si PRD4 devient
négatif en fin de journée, tout le surplus injecté dans la journée est valorisé
au prix négatif.

### Mode ACC

```
3ERL Bridage_CDC = 1
      ↓
Shelly ON → Level 2 → export limité au talon %
```

La valorisation est au **PRE+ du quart d'heure en cours**. Le Level 2 maintient
un talon minimal pour ne pas priver les voisins ACC de leur consommation.

### Priorité batterie Zendure

Le package HA intègre une condition sur le SOC des batteries Zendure :

```yaml
{% set soc   = states('sensor.zendure_batterie_pourcentage')|float(0) %}
{% set seuil = states('input_number.batterie_seuil_bridage')|float(95) %}
{% set bat_ok = soc >= seuil %}

# Bridage actif seulement si 3ERL demande ET batteries >= seuil
{{ "on" if mode == "On" or (mode == "Auto" and aci == "on" and bat_ok) else "off" }}
```

**Pourquoi cette condition ?**

Si les batteries ne sont pas pleines (< seuil), le surplus peut être absorbé
par le Zendure plutôt que d'aller sur le réseau → inutile de brider via l'Envoy.

Le seuil est configurable depuis le dashboard HA (slider 50-100 %, pas de 5 %).

**Réévaluation automatique :**
L'automation [53] réévalue le bridage immédiatement quand le SOC franchit
le seuil, sans attendre la prochaine MAJ 3ERL.

---

## Dashboard Home Assistant

Copier le contenu de `3erl_dashboard.yaml` dans l'éditeur de carte Lovelace.

**Carte incluse :**

```
┌─────────────────────────────────────┐
│  Statut 3ERL                        │
│  • Zero-Inject actif (on/off)       │
│  • Tendance du jour (🟢/⚠️/⛔️)      │
│  • Dernier PRE+ (€/MWh)             │
│  • Estimation journalière (€/MWh)   │
│  • Bridage long terme (heure)       │
│  • Dernière MAJ 3ERL                │
├─────────────────────────────────────┤
│  Puissances Envoy (temps réel)      │
│  • Production solaire (W)           │
│  • Consommation maison (W)          │
│  • Flux réseau (W) — négatif=export │
├─────────────────────────────────────┤
│  Contrôle manuel                    │
│  • Mode (Auto / On / Off)           │
│  • Test bridage (toggle)            │
│  • Seuil SOC batterie (slider)      │
│  • Relais Shelly (état)             │
├─────────────────────────────────────┤
│  Graphique historique 24h           │
│  • Flux réseau vs bridage vs PRE+   │
└─────────────────────────────────────┘
```

---

## Entités exposées

| Entité | Type | Description |
|---|---|---|
| `binary_sensor.3erl_bridage_demande` | binary_sensor | Signal ACI (0/1) |
| `binary_sensor.3erl_bridage_cdc_demande` | binary_sensor | Signal ACC (0/1) |
| `binary_sensor.inverters_zero_inject` | binary_sensor | Décision finale bridage |
| `sensor.3erl_dernier_pre` | sensor | Dernier PRE+ €/MWh |
| `sensor.3erl_estimation_jour_prd4` | sensor | PRD4 journalier €/MWh |
| `sensor.3erl_tendance_du_jour` | sensor | Tendance emoji |
| `sensor.3erl_heure_update` | sensor | Horodatage dernière MAJ |
| `sensor.3erl_bridage_long_terme` | sensor | Heure de début injection |
| `sensor.electricite_prep_daily_estimation` | sensor | Estimation PRE+ journalier |
| `sensor.electricite_energie_injectee_envoy` | sensor | kWh injectés (total) |
| `input_select.inverters_zero_inject_mode` | input | Auto / On / Off |
| `input_number.batterie_seuil_bridage` | input | Seuil SOC % bridage |
| `switch.buanderie_shelly_emphase` | switch | Relais Shelly Plus 1 |

---

## Automations HA

| ID | Alias | Déclencheur | Action |
|---|---|---|---|
| 0000000000040 | Notify Zero-Inject State Change | Changement état bridage | Notification mobile |
| 0000000000043 | Update API 3ERL + PRE+ + PRD3 | :05/:20/:35/:50 + retry | Rafraîchit tous les capteurs |
| 0000000000050 | Activer bridage Shelly → Envoy DRM | inverters_zero_inject → ON | switch.turn_on Shelly |
| 0000000000051 | Désactiver bridage Shelly → Envoy DRM | inverters_zero_inject → OFF | switch.turn_off Shelly |
| 0000000000052 | Sécurité capteur 3ERL indisponible | 3erl_bridage_demande unavailable > 20 min | switch.turn_off Shelly |
| 0000000000053 | Réévaluation bridage sur changement SOC | SOC franchit le seuil | update_entity binary_sensor |

---

## Crédits

- **3ERL** — [https://3erl.fr](https://3erl.fr) — API publique de bridage et responsable d'équilibre
- **Mathieu Carbou** — [gist original](https://gist.github.com/mathieucarbou/8d83d25247821e85a693dea61fe4f0d2) dont ce projet est adapté
- **Enphase** — Documentation Envoy-S Metered EU, port DRM
- **Shelly** — Shelly Plus 1, scripting mJS
- **Home Assistant** — Plateforme domotique

---

## Licence

MIT — Utilisation libre, sans garantie. Ce projet n'est pas affilié à 3ERL, Enphase ou Shelly.
