// ============================================================
// Script Shelly Plus 1 — Bridage 3ERL mode ACI
// Autoconsommation Individuelle
//
// Utilise le champ "Bridage" de l'API 3ERL publique.
// En ACI, la rémunération est la moyenne pondérée journalière
// (champ PRD4). Si le PRD4 devient négatif en fin de journée,
// TOUT le surplus injecté dans la journée est valorisé au prix
// négatif. Suivre impérativement ce signal de bridage.
//
// Câblage :
//   I du Shelly → borne 1/5 (Relay 1) de l'Envoy
//   O du Shelly → borne Com de l'Envoy
//   Shelly OFF (repos) = contact ouvert = Level 1 = 100 % export
//   Shelly ON          = contact fermé  = Level 2 = 0 % export
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
var USER_AGENT  = "Shelly/3ERL-Zero-Inject-ACI";
var RELAY_ID    = 0;
var TIMEOUT_SEC = 10;
var INTERVAL_MS = 60 * 1000;
var MAX_AGE_MS  = 20 * 60 * 1000;

var UPDATE_MINUTES = [4, 19, 34, 49];

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
    print("[3ERL-ACI] Pas de changement (Bridage=" + bridage + ")");
    return;
  }
  var wantOn = (bridage === 1);
  Shelly.call("Switch.Set", { id: RELAY_ID, on: wantOn },
    function(res, err_code, err_msg) {
      if (err_code !== 0) {
        print("[3ERL-ACI] Erreur relais:", err_code, err_msg);
        return;
      }
      lastBridageValue = bridage;
      print("[3ERL-ACI] Relais → " +
        (wantOn ? "ON  (bridage actif, export 0 %)" : "OFF (export libre, 100 %)"));
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
    print("[3ERL-ACI] Pas d'interrogation (min=" + minute +
          ", age=" + Math.round(dataAge / 1000) + "s)");
    return;
  }

  print("[3ERL-ACI] Interrogation API 3ERL...");

  Shelly.call("HTTP.GET",
    { url: API_URL, headers: { "User-Agent": USER_AGENT }, timeout: TIMEOUT_SEC },
    function(result, err_code, err_msg) {
      if (err_code !== 0) {
        print("[3ERL-ACI] Erreur réseau:", err_code, err_msg);
        return;
      }
      if (!result || result.code !== 200) {
        print("[3ERL-ACI] HTTP inattendu:", result ? result.code : "null");
        return;
      }
      var data;
      try { data = JSON.parse(result.body); }
      catch (e) { print("[3ERL-ACI] Erreur JSON:", e); return; }

      lastUpdateMs = Date.now();
      print("[3ERL-ACI] Bridage=" + data.Bridage +
            " | PRE+=" + data.Dernier_PREP + " EUR/MWh" +
            " | PRD4=" + data.PRD4 + " EUR/MWh" +
            " | MAJ=" + data.Heure_Update);

      // ACI → champ "Bridage" (moyenne journalière)
      setRelay(data.Bridage);
    }
  );
}

print("[3ERL-ACI] Démarrage script bridage ACI — Relay ID=" + RELAY_ID);
fetchAndApply();
Timer.set(INTERVAL_MS, true, fetchAndApply);
