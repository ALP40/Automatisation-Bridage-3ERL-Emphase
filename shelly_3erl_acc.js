// ============================================================
// Script Shelly Plus 1 — Bridage 3ERL mode ACC
// Autoconsommation Collective (SiSol, etc.)
//
// Utilise le champ "Bridage_CDC" de l'API 3ERL publique.
// En ACC, la valorisation est au PRE+ du quart d'heure en cours.
//
// ⚠️ En ACC, le Level 2 de l'Envoy NE DOIT PAS être à 0 % !
// Il faut maintenir un talon de production pour couvrir :
//   - Le talon de consommation de votre maison
//   - Le talon de consommation total de vos voisins ACC
// Exemple : (talon_maison + talon_voisins) / puissance_AC × 100
//   (200W + 500W) / 6200W × 100 = ~11 %
// → Configurer Level 2 à ce pourcentage dans Enlighten Manager.
//
// Câblage :
//   I du Shelly → borne 1/5 (Relay 1) de l'Envoy
//   O du Shelly → borne Com de l'Envoy
//   Shelly OFF (repos) = contact ouvert = Level 1 = 100 % export
//   Shelly ON          = contact fermé  = Level 2 = talon % export
//
// 3ERL publie aux minutes :03, :18, :33, :48
// Ce script interroge aux minutes :05, :20, :35, :50
// + retry conditionnel chaque minute si données absentes ou > 20 min
//
// Déploiement :
//   Shelly Web UI → Scripts → Créer → coller → Sauvegarder
//   Activer "Lancer au démarrage" (Run on startup)
// ============================================================

var API_URL     = "https://3erl.fr/api.json";
var USER_AGENT  = "Shelly/3ERL-Zero-Inject-ACC";
var RELAY_ID    = 0;
var TIMEOUT_SEC = 10;
var INTERVAL_MS = 60 * 1000;
var MAX_AGE_MS  = 20 * 60 * 1000;

var UPDATE_MINUTES = [5, 20, 35, 50];

var lastBridageValue = -1;
var lastUpdateMs     = 0;

function isUpdateMinute(minute) {
  for (var i = 0; i < UPDATE_MINUTES.length; i++) {
    if (UPDATE_MINUTES[i] === minute) return true;
  }
  return false;
}

function setRelay(bridage) {
  if (bridage === lastBridageValue) {
    print("[3ERL-ACC] Pas de changement (Bridage_CDC=" + bridage + ")");
    return;
  }
  var wantOn = (bridage === 1);
  Shelly.call("Switch.Set", { id: RELAY_ID, on: wantOn },
    function(res, err_code, err_msg) {
      if (err_code !== 0) {
        print("[3ERL-ACC] Erreur relais:", err_code, err_msg);
        return;
      }
      lastBridageValue = bridage;
      print("[3ERL-ACC] Relais → " +
        (wantOn ? "ON  (bridage actif, export limité au talon)" :
                  "OFF (export libre, 100 %)"));
    }
  );
}

function fetchAndApply() {
  var now     = new Date();
  var minute  = now.getMinutes();
  var nowMs   = now.getTime();
  var dataAge = nowMs - lastUpdateMs;

  var shouldQuery = isUpdateMinute(minute)
                    || lastUpdateMs === 0
                    || dataAge > MAX_AGE_MS;

  if (!shouldQuery) {
    print("[3ERL-ACC] Pas d'interrogation (min=" + minute +
          ", age=" + Math.round(dataAge / 1000) + "s)");
    return;
  }

  print("[3ERL-ACC] Interrogation API 3ERL...");

  Shelly.call("HTTP.GET",
    { url: API_URL, headers: { "User-Agent": USER_AGENT }, timeout: TIMEOUT_SEC },
    function(result, err_code, err_msg) {
      if (err_code !== 0) {
        print("[3ERL-ACC] Erreur réseau:", err_code, err_msg);
        return;
      }
      if (!result || result.code !== 200) {
        print("[3ERL-ACC] HTTP inattendu:", result ? result.code : "null");
        return;
      }
      var data;
      try { data = JSON.parse(result.body); }
      catch (e) { print("[3ERL-ACC] Erreur JSON:", e); return; }

      lastUpdateMs = Date.now();
      print("[3ERL-ACC] Bridage_CDC=" + data.Bridage_CDC +
            " | PRE+=" + data.Dernier_PREP + " EUR/MWh" +
            " | MAJ=" + data.Heure_Update);

      // ACC → champ "Bridage_CDC" (PRE+ quart-horaire)
      setRelay(data.Bridage_CDC);
    }
  );
}

print("[3ERL-ACC] Démarrage script bridage ACC — Relay ID=" + RELAY_ID);
fetchAndApply();
Timer.set(INTERVAL_MS, true, fetchAndApply);
