"""Validate design references and route coverage, never application behavior."""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[3]
HERE = pathlib.Path(__file__).resolve().parent

catalog = json.loads((HERE / "screen-catalog.json").read_text())
routes = json.loads((HERE / "route-coverage.json").read_text())
evidence = json.loads((HERE / "design-evidence.json").read_text())
screens = [*catalog["screens"], *catalog.get("additionalScreens", [])]
keys = {screen["key"] for screen in screens}
assert len(keys) == len(screens), "Duplicate screen key"
assert len({screen["nodeId"] for screen in screens}) == len(screens), "Duplicate frame"
overlays = catalog.get("overlays", [])
assert len({screen["key"] for screen in overlays}) == len(overlays), "Duplicate overlay key"
assert not ({screen["nodeId"] for screen in overlays} & {screen["nodeId"] for screen in screens}), "Overlay duplicates a screen"
assert all(screen["status"] == "designed-awaiting-review" for screen in screens)
assert all(screen["width"] > 0 and screen["height"] > 0 for screen in screens)
declared = set(re.findall(r'path="([^"]+)"', (ROOT / "client/src/App.tsx").read_text()))
assert declared == {route["path"] for route in routes["currentRoutes"]}, "Route coverage drift"
assert all(route["screens"] for route in routes["currentRoutes"])
assert not evidence["validation"]["outside"]
assert not evidence["validation"]["overflow"]
assert not evidence["validation"]["legacyMasterReferences"]
assert not evidence["validation"]["nonPublicImagesInAuth"]
assert not evidence["prototype"]["invalidDestinations"]
assert not evidence["prototype"]["missingJourneySteps"]
for name, path in evidence["reviewJourneys"].items():
    assert all(key in keys or key.startswith("O") for key in path), name
assert evidence["qualification"]["applicationTestsExecuted"] == 0
assert not evidence["qualification"]["applicationImplementationStarted"]
assert not evidence["qualification"]["ownerApproved"]
print(json.dumps({
    "screens": len(screens),
    "current_routes": len(declared),
    "review_journeys": len(evidence["reviewJourneys"]),
    "prototype_transitions": evidence["prototype"]["transitions"],
    "application_tests_executed": 0,
}))
