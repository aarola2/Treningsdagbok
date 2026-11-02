#!/usr/bin/env bash
# Kontrollerer GitHub-innstillingene som Claude ikke kan lese (rulesett, miljøer, skanning).
# Kjøres av EIER i terminalen, fra repomappen, med gh innlogget som eier/admin:
#
#   bash scripts/sjekk-github-oppsett.sh
#
# Scriptet leser bare. Det endrer ingenting. Det avslutter med kode 1 hvis noe er FEIL.
# Kjør det: etter første CI-kjøring, etter at du har lagt til eller endret en CI-jobb, før du setter
# PRODUKSJON_GODKJENNING_VERIFISERT, og før hvert slipp. Lim utdataene inn i chatten til Claude.
set -u

CI_FIL="${CI_FIL:-.github/workflows/ci.yml}"
DEPLOY_FIL="${DEPLOY_FIL:-.github/workflows/deploy.yml}"
PROD="${PROD_MILJO:-production}"
STAGING="${STAGING_MILJO:-staging}"
VARIABEL="PRODUKSJON_GODKJENNING_VERIFISERT"

FEIL=0
ok()    { printf '  OK     %s\n' "$1"; }
feil()  { printf '  FEIL   %s\n' "$1"; FEIL=1; }
sjekk() { printf '  SJEKK  %s\n' "$1"; }

command -v gh >/dev/null 2>&1 || { echo "gh (GitHub CLI) er ikke installert."; exit 2; }
REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null)" || {
  echo "Fant ikke repoet. Kjør fra repomappen og sjekk 'gh auth status'."; exit 2; }

echo "Repo: $REPO"
echo

# ---------------------------------------------------------------- 1. Ruleset
echo "1. Ruleset for main"
RS_IDS="$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.enforcement=="active" and .target=="branch") | .id' 2>/dev/null)"
TYPER=""
KONTEKSTER=""
for id in $RS_IDS; do
  RAMMER="$(gh api "repos/$REPO/rulesets/$id" --jq '(.conditions.ref_name.include // []) | map(select(. == "~DEFAULT_BRANCH" or . == "refs/heads/main")) | length' 2>/dev/null)"
  [ "${RAMMER:-0}" -ge 1 ] || continue
  TYPER="$TYPER
$(gh api "repos/$REPO/rulesets/$id" --jq '.rules[].type' 2>/dev/null)"
  KONTEKSTER="$KONTEKSTER
$(gh api "repos/$REPO/rulesets/$id" --jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context' 2>/dev/null)"
done
if [ -z "$(printf '%s' "$TYPER" | tr -d '[:space:]')" ]; then
  feil "Fant ingen aktiv ruleset som gjelder main. Opprett den, og sett Enforcement til Active (Settings -> Rules -> Rulesets)."
else
  for regel in deletion non_fast_forward pull_request required_status_checks code_scanning; do
    if printf '%s\n' "$TYPER" | grep -qx "$regel"; then
      ok "Regel på plass: $regel"
    else
      feil "Regel mangler i rulesettet: $regel"
    fi
  done
fi

echo
echo "2. Er alle CI-jobber påkrevd?"
if [ ! -f "$CI_FIL" ]; then
  feil "Fant ikke $CI_FIL"
else
  JOBBER="$(awk '/^jobs:/{inj=1; next} inj && /^[^ #]/{inj=0} inj && /^  [A-Za-z0-9_-]+:[[:space:]]*(#.*)?$/{sub(/^  /,""); sub(/:.*/,""); print}' "$CI_FIL")"
  if [ -z "$JOBBER" ]; then
    sjekk "Fant ingen jobber i $CI_FIL"
  fi
  for j in $JOBBER; do
    if printf '%s\n' "$KONTEKSTER" | grep -Eq "^${j}( \\(.*\\))?$"; then
      ok "Påkrevd: $j"
    else
      feil "Jobben '$j' i $CI_FIL er IKKE påkrevd i rulesettet. En jobb som ikke er påkrevd, beskytter ingenting. Legg den til under Require status checks."
    fi
  done
  sjekk "Hvis du har gitt en jobb et eget 'name:', er sjekknavnet i GitHub det navnet. Kontroller det manuelt."
fi

# ---------------------------------------------------------------- 3. Miljøer
echo
echo "3. Miljøet $PROD"
if ! gh api "repos/$REPO/environments/$PROD" >/dev/null 2>&1; then
  feil "Miljøet '$PROD' finnes ikke. Opprett det manuelt: Settings -> Environments -> New environment. (GitHub oppretter det ikke av seg selv før en jobb som bruker det har kjørt.)"
else
  ok "Miljøet finnes"
  ANT="$(gh api "repos/$REPO/environments/$PROD" --jq '[.protection_rules[]? | select(.type=="required_reviewers") | .reviewers[]?] | length' 2>/dev/null)"
  if [ "${ANT:-0}" -ge 1 ]; then ok "Required reviewers er satt ($ANT)"; else feil "Required reviewers mangler eller er ikke lagret"; fi
  BYPASS="$(gh api "repos/$REPO/environments/$PROD" --jq '.can_admins_bypass' 2>/dev/null)"
  if [ "$BYPASS" = "false" ]; then ok "Admin-bypass er av"; else feil "«Allow administrators to bypass» må være av"; fi
  SELV="$(gh api "repos/$REPO/environments/$PROD" --jq '[.protection_rules[]? | select(.type=="required_reviewers") | .prevent_self_review] | first' 2>/dev/null)"
  if [ "$SELV" = "true" ]; then
    sjekk "«Prevent self-review» er på. Er du eneste utvikler, kan du ikke godkjenne dine egne deploys."
  fi
  BRANCHPOL="$(gh api "repos/$REPO/environments/$PROD" --jq '.deployment_branch_policy.custom_branch_policies // false' 2>/dev/null)"
  if [ "$BRANCHPOL" = "true" ]; then
    REGLER="$(gh api "repos/$REPO/environments/$PROD/deployment-branch-policies" --jq '.branch_policies[] | (.type // "branch") + ":" + .name' 2>/dev/null)"
    if printf '%s\n' "$REGLER" | grep -qx 'branch:main'; then ok "Deployment branches tillater main"; else feil "Deployment branches må tillate branch 'main'"; fi
    if grep -q 'tags:' "$DEPLOY_FIL" 2>/dev/null; then
      if printf '%s\n' "$REGLER" | grep -qx 'tag:v\*'; then
        ok "Deployment tags tillater v*"
      else
        feil "Utrullingen starter på tag, men miljøet mangler tag-regelen 'v*' (Deployment branches and tags -> Add deployment branch or tag rule -> Tag)"
      fi
    fi
  else
    feil "Deployment branches må begrenses til valgte branches og tags (ikke 'No restriction')"
  fi
fi

echo
echo "4. Miljøet $STAGING"
if gh api "repos/$REPO/environments/$STAGING" >/dev/null 2>&1; then
  ok "Miljøet finnes"
else
  feil "Miljøet '$STAGING' finnes ikke. Opprett det manuelt (Settings -> Environments -> New environment)."
fi

echo
echo "5. Produksjonsvariabelen"
VERDI="$(gh api "repos/$REPO/actions/variables/$VARIABEL" --jq .value 2>/dev/null)"
if [ -z "$VERDI" ]; then
  sjekk "$VARIABEL er ikke satt. Riktig til sperretesten har vist «Waiting for review»."
elif [ "$VERDI" = "true" ]; then
  sjekk "$VARIABEL er 'true'. Det forutsetter at «Sperretest produksjon» har stått som «Waiting for review». Det kan ikke dette scriptet bevise."
else
  feil "$VARIABEL har verdien '$VERDI'. Den skal enten mangle eller være nøyaktig 'true'."
fi

# ---------------------------------------------------------------- Skanning og Pages
echo
echo "6. Skanning"
if gh api "repos/$REPO/vulnerability-alerts" >/dev/null 2>&1; then ok "Dependabot alerts er på"; else feil "Dependabot alerts er av"; fi
SS="$(gh api "repos/$REPO" --jq '.security_and_analysis.secret_scanning.status' 2>/dev/null)"
PP="$(gh api "repos/$REPO" --jq '.security_and_analysis.secret_scanning_push_protection.status' 2>/dev/null)"
if [ "$SS" = "enabled" ]; then ok "Secret scanning er på"; else feil "Secret scanning er ikke på (status: ${SS:-ukjent})"; fi
if [ "$PP" = "enabled" ]; then ok "Push protection er på"; else feil "Push protection er ikke på (status: ${PP:-ukjent})"; fi

echo
echo "7. Pages"
BT="$(gh api "repos/$REPO/pages" --jq .build_type 2>/dev/null)"
if [ -z "$BT" ]; then
  sjekk "Pages er ikke slått på (ok hvis prosjektet ikke bruker Pages)"
elif [ "$BT" = "workflow" ]; then
  ok "Pages Source er GitHub Actions"
else
  feil "Pages Source er '$BT'. Sett den til GitHub Actions."
fi

echo
if [ "$FEIL" -eq 0 ]; then
  echo "Ingen FEIL. Gå gjennom SJEKK-linjene manuelt."
else
  echo "Det er FEIL over. Rett dem i GitHub og kjør scriptet på nytt."
fi
exit "$FEIL"
