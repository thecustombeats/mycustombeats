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

# register_artwork ORDER — registers a technically valid SYNTHETIC production
# output (tests/fixtures/artwork-*.png) for every artwork component that is not
# READY, the way staff would after preparing the real artwork.
register_artwork() {
  local oid="$1" ref
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
    flags = []
    if c["status"] == "TEMPLATE_REQUIRED": flags.append("manual_template_confirmed=true")
    if c["status"] == "EXCEPTION": flags.append("exception_reviewed=true")
    if c["source"] is None: flags.append("manual_source=true")
    print(c["artwork_id"], t["id"], t["version"], f, ",".join(flags) or "-")
PY
  while read -r aid tpl ver file flags; do
    [ -z "$aid" ] && continue
    local extra=()
    if [ "$flags" != "-" ]; then for fl in ${flags//,/ }; do extra+=(-F "$fl"); done; fi
    curl -s -o /dev/null -X POST "$BASE/crm/artwork" -H "Authorization: Bearer $AUTOMATION_CRM_KEY" \
      -F "order_id=$oid" -F "artwork_id=$aid" -F "reference=$ref" -F "template_id=$tpl" -F "template_version=$ver" \
      -F "staff=Artwork Tester" "${extra[@]}" -F "output=@tests/fixtures/$file;type=image/png"
  done < /tmp/aw-todo.txt
}
