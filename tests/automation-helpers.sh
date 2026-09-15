# Shared by the backend acceptance suites (sourced; needs BASE).
#
# TEST ONLY. The founder codes below are fake values for the throwaway test
# stack; tests/README.md gives the matching password hashes for the test
# config. They are not, and must never be, real founder codes.

AUTOMATION_CRM_KEY="test_crm_key_not_real_000000000000000000000"
FOUNDER_CODE_BELLA="test-founder-bella-not-real"
FOUNDER_CODE_LEWIS="test-founder-lewis-not-real"
NOTIFICATION_WORKER_KEY="test_notification_worker_key_not_real_0000"

# founder_authorise ORDER FOUNDER CODE → HTTP code (body in /tmp/fa.json)
founder_authorise() {
  curl -s -o /tmp/fa.json -w '%{http_code}' -X POST "$BASE/crm/order-action" -H "Authorization: Bearer $AUTOMATION_CRM_KEY" \
    -H 'Content-Type: application/json' \
    -d "{\"order_id\":$1,\"action\":\"AUTHORISE_SUPPLIER_PURCHASE\",\"staff\":\"Founder Test\",\"founder\":\"$2\",\"founder_code\":\"$3\",\"confirm\":true}"
}

# ensure_art_master ORDER — for every record without a current Creative Art Master
# that passed visual QC: prepare unready source photos (as a person would),
# register a SYNTHETIC art master (MANUAL_DESIGN) and pass MCB's visual QC.
ensure_art_master() {
  local oid="$1" ref
  ref=$(docker exec mcb-db mariadb -umcb -ptestpass -N -B -e "SELECT mcb_reference FROM orders WHERE id=$oid" mcb_crm 2>/dev/null)
  curl -s -o /tmp/pf-view.json "$BASE/crm/production-files?order_id=$oid&staff=Artwork%20Tester" -H "Authorization: Bearer $AUTOMATION_CRM_KEY"
  python3 - "$oid" > /tmp/pf-todo.sh <<'PY'
import json, sys
oid = int(sys.argv[1])
d = json.load(open("/tmp/pf-view.json"))
crit = {c: "PASS" for c in d.get("visual_qc_criteria", [])}
for job in d.get("jobs", []):
    arts = [a for a in d["art_masters"] if int(a["job_id"]) == int(job["id"]) and int(a["is_current"]) == 1]
    if arts and arts[0]["visual_qc_status"] == "PASS":
        continue
    photos = [p for p in d["image_preparation"] if int(p["unit_id"]) == int(job["unit_id"])]
    for p in photos:
        if p["status"] in ("PREPARATION_REQUIRED", "EXCEPTION"):
            for step in ({"status": "PREPARATION_IN_PROGRESS"}, {"status": "PREPARED", "notes": "Test fixture: colour and crop only", "identity_preserved": True}):
                print("pfpost '%s'" % json.dumps(dict({"action": "IMAGE_PREPARATION", "order_id": oid, "staff": "Artwork Tester", "upload_id": int(p["upload_id"])}, **step)))
    sources = ",".join(str(p["upload_id"]) for p in photos if p["status"] != "UNUSABLE")
    print("pfart %d %s" % (int(job["id"]), sources or "0"))
    print("pfqc %d '%s'" % (int(job["id"]), json.dumps(crit)))
PY
  pfpost() { curl -s -o /dev/null -X POST "$BASE/crm/production-files" -H "Authorization: Bearer $AUTOMATION_CRM_KEY" -H 'Content-Type: application/json' -d "$1"; }
  pfart() { curl -s -o /tmp/pf-art.json -X POST "$BASE/crm/production-files" -H "Authorization: Bearer $AUTOMATION_CRM_KEY" \
      -F action=REGISTER_ART_MASTER -F "order_id=$oid" -F "reference=$ref" -F "artwork_job_id=$1" -F creation_method=MANUAL_DESIGN -F "source_upload_ids=$2" -F "staff=Artwork Tester" -F "art=@tests/fixtures/artwork-3600x3600.png;type=image/png"; }
  pfqc() { local aid; aid=$(python3 -c 'import json;print(json.load(open("/tmp/pf-art.json")).get("art_master_id",0))')
    curl -s -o /dev/null -X POST "$BASE/crm/production-files" -H "Authorization: Bearer $AUTOMATION_CRM_KEY" -H 'Content-Type: application/json' \
      -d "{\"action\":\"VISUAL_QC\",\"order_id\":$oid,\"staff\":\"Artwork Tester\",\"art_master_id\":$aid,\"outcome\":\"PASS\",\"criteria\":$2}"; }
  . /tmp/pf-todo.sh
}

# current_art_master ORDER UNIT → id of the current art master (or empty)
current_art_master() { docker exec mcb-db mariadb -umcb -ptestpass -N -B -e "SELECT id FROM artwork_art_masters WHERE order_id=$1 AND unit_id=$2 AND is_current=1" mcb_crm 2>/dev/null; }

# register_artwork ORDER — registers a technically valid SYNTHETIC print
# production master (tests/fixtures/artwork-*.png) for every artwork component
# that is not READY, rendered from the current art master (created if needed),
# with MCB's manual safe-zone review, the way staff would.
register_artwork() {
  local oid="$1" ref
  ensure_art_master "$oid"
  curl -s -o /tmp/aw-plan.json "$BASE/crm/artwork?order_id=$oid" -H "Authorization: Bearer $AUTOMATION_CRM_KEY"
  ref=$(docker exec mcb-db mariadb -umcb -ptestpass -N -B -e "SELECT mcb_reference FROM orders WHERE id=$oid" mcb_crm 2>/dev/null)
  python3 - > /tmp/aw-todo.txt <<'PY'
import json
d = json.load(open("/tmp/aw-plan.json"))
for c in d.get("components", []):
    if c["status"] == "READY":
        continue
    t = c["template"]; px = t["output_px"]
    f = "artwork-%dx%d.png" % (px["width"], px["height"]) if px else "artwork-3600x3600.png"
    flags = ["safe_zone_reviewed=true"]
    if c["status"] == "TEMPLATE_REQUIRED": flags.append("manual_template_confirmed=true")
    if c["status"] == "EXCEPTION": flags.append("exception_reviewed=true")
    if c["source"] is None: flags.append("manual_source=true")
    print(c["artwork_id"], c["unit_id"], t["id"], t["version"], f, ",".join(flags))
PY
  while read -r aid unit tpl ver file flags; do
    [ -z "$aid" ] && continue
    local extra=() am sku
    for fl in ${flags//,/ }; do extra+=(-F "$fl"); done
    am=$(current_art_master "$oid" "$unit")
    sku=$(docker exec mcb-db mariadb -umcb -ptestpass -N -B -e "SELECT sku FROM order_units WHERE id=$unit" mcb_crm 2>/dev/null)
    curl -s -o /dev/null -X POST "$BASE/crm/artwork" -H "Authorization: Bearer $AUTOMATION_CRM_KEY" \
      -F "order_id=$oid" -F "artwork_id=$aid" -F "art_master_id=$am" -F "sku=$sku" -F "reference=$ref" -F "template_id=$tpl" -F "template_version=$ver" \
      -F "staff=Artwork Tester" "${extra[@]}" -F "output=@tests/fixtures/$file;type=image/png"
  done < /tmp/aw-todo.txt
}
