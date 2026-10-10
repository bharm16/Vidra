#!/usr/bin/env python3
"""Check implementation ownership/dependencies and generate planning documents.

This checks the plan, not application behavior. No provider/network calls.
Run with --write after changing implementation-plan.json to refresh readable files.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def fail(condition: bool, message: str) -> None:
    if condition:
        raise ValueError(message)


def table(headers: list[str], rows: list[list[str]]) -> list[str]:
    # Keep generated tables stable without depending on a JS formatter.
    return ["<!-- prettier-ignore -->", "| " + " | ".join(headers) + " |",
            "| " + " | ".join("---" for _ in headers) + " |"] + [
                "| " + " | ".join(str(cell).replace("|", "/").replace("\n", " ") for cell in row) + " |"
                for row in rows
            ] + [""]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    repo = root.parents[2]
    plan = json.loads((root / "implementation-plan.json").read_text())
    model = json.loads((root / "state-model.json").read_text())
    accepted = json.loads((root / "acceptance-cases.json").read_text())
    packages = {x["id"]: x for x in plan["packages"]}
    suites = {x["id"]: x for x in plan["testSuites"]}
    cases = {x["id"]: x for x in accepted["cases"]}
    models = {x["id"]: x for x in model["models"]}
    fail(len(packages) != len(plan["packages"]), "Duplicate work-package ID")
    fail(len(suites) != len(plan["testSuites"]), "Duplicate suite ID")

    for package in packages.values():
        fail(package["status"] != "planned", "This plan does not carry implementation evidence")
        fail(not package["commits"] or not package["exitCriteria"] or not package["testFocus"],
             f"Incomplete package: {package['id']}")
        fail(len(set(package["dependsOn"])) != len(package["dependsOn"]),
             f"Duplicate dependency: {package['id']}")
        for dependency in package["dependsOn"]:
            fail(dependency not in packages or dependency == package["id"],
                 f"Invalid dependency: {package['id']} -> {dependency}")
        for path in package["existingAreas"]:
            fail(not (repo / path).exists(), f"Missing claimed existing module: {path}")
        for path in package["newAreas"]:
            fail(path.startswith("/") or ".." in Path(path).parts,
                 f"Unsafe proposed path: {path}")

    waves: list[list[str]] = []
    completed: set[str] = set()
    while len(completed) < len(packages):
        ready = [key for key, value in packages.items()
                 if key not in completed and set(value["dependsOn"]) <= completed]
        fail(not ready, f"Dependency cycle: {set(packages) - completed}")
        waves.append(ready)
        completed.update(ready)

    def owners_and_suites(owner: str, suite_ids: list[str]) -> None:
        fail(owner not in packages, f"Unknown package owner: {owner}")
        fail(not suite_ids, f"No test suite for {owner}")
        for sid in suite_ids:
            fail(sid not in suites, f"Unknown test suite: {sid}")

    for suite in suites.values():
        fail(suite["owner"] not in packages, f"Unknown suite owner: {suite['id']}")
        fail(suite["status"] != "planned", f"Unproven suite status: {suite['id']}")
        fail(not suite["path"] or not suite["contract"], f"Incomplete suite: {suite['id']}")

    expected_states = {(m["id"], state) for m in model["models"] for state in m["states"]}
    states = {(x["model"], x["state"]): x for x in plan["stateAssignments"]}
    fail(len(states) != len(plan["stateAssignments"]), "Duplicate state assignment")
    fail(set(states) != expected_states,
         f"State coverage differs: missing={expected_states - set(states)}, extra={set(states) - expected_states}")
    for assignment in states.values():
        owners_and_suites(assignment["owner"], assignment["suites"])
        fail(assignment["disposition"] not in {"KEEP", "EXTEND", "REPLACE", "NEW"}, "Invalid disposition")
        fail(not assignment["implementation"] or not assignment["reason"], "State lacks implementation rationale")

    expected_edges = {(m["id"], t["from"], t["event"]): t
                      for m in model["models"] for t in m["transitions"]}
    edges = {(x["model"], x["from"], x["event"]): x for x in plan["transitionAssignments"]}
    fail(len(edges) != len(plan["transitionAssignments"]), "Duplicate transition assignment")
    fail(set(edges) != set(expected_edges), "Transition coverage differs from current contract")
    for key, assignment in edges.items():
        owners_and_suites(assignment["owner"], [assignment["suite"]])
        fail(assignment["to"] != expected_edges[key]["to"] or assignment["rule"] != expected_edges[key]["rule"],
             f"Stale transition: {key}")

    expected_rejects = {(m["id"], state, event)
                        for m in model["models"] for state in m["states"] for event in m["events"]
                        if (m["id"], state, event) not in expected_edges}
    rejects = {(x["model"], x["state"], x["event"]): x for x in plan["rejectionAssignments"]}
    fail(len(rejects) != len(plan["rejectionAssignments"]), "Duplicate rejected-pair assignment")
    fail(set(rejects) != expected_rejects, "Rejected state/event coverage differs")
    for assignment in rejects.values():
        owners_and_suites(assignment["owner"], [assignment["suite"]])
        fail(not assignment["assertion"], "Rejected pair lacks side-effect assertion")

    group_readiness = {}
    for assignment in [*states.values(), *edges.values()]:
        group_readiness.setdefault(assignment["model"], set()).add(assignment["owner"])
    fail({k: set(v) for k, v in plan["stateGroupTestReadyAfter"].items()} != group_readiness,
         "State-group production readiness differs from its implementation owners")
    for assignment in [*states.values(), *edges.values(), *rejects.values()]:
        fail(set(assignment["testReadyAfter"]) != group_readiness[assignment["model"]],
             f"Missing state-group conformance readiness: {assignment['model']}")

    case_assignments = {x["caseId"]: x for x in plan["acceptanceAssignments"]}
    fail(len(case_assignments) != len(plan["acceptanceAssignments"]), "Duplicate acceptance assignment")
    fail(set(case_assignments) != set(cases), "Original acceptance-case coverage differs")
    for assignment in case_assignments.values():
        owners_and_suites(assignment["owner"], assignment["suites"])
        production = set(assignment["requiredProductionPackages"])
        fail(not production <= set(packages), f"Unknown production boundary: {assignment['caseId']}")
        required = {assignment["owner"]} | production | {suites[sid]["owner"] for sid in assignment["suites"]}
        fail(set(assignment["testReadyAfter"]) != required, f"Missing test readiness dependency: {assignment['caseId']}")
    for package in packages.values():
        actual = {x["caseId"] for x in case_assignments.values() if x["owner"] == package["id"]}
        fail(set(package["caseIds"]) != actual, f"Stale package case list: {package['id']}")

    actor_assignments = {x["actor"]: x for x in plan["actorAssignments"]}
    fail(len(actor_assignments) != len(plan["actorAssignments"]), "Duplicate actor assignment")
    fail(set(actor_assignments) != set(model["reusedModels"]), "Missing reused state-group actor")
    fail(set(model["reusedModelGroups"]) != set(model["reusedModels"]), "Actor structure differs from documented reuse")
    for actor in actor_assignments.values():
        owners_and_suites(actor["owner"], [actor["suite"]])
        fail(not actor["models"] or not set(actor["models"]) <= set(models), "Invalid actor state groups")
        fail(set(actor["models"]) != set(model["reusedModelGroups"][actor["actor"]]),
             f"Missing required state group for action adapter: {actor['actor']}")

    gates = {g["id"]: g for g in plan["releaseGates"]}
    fail(len(gates) != len(plan["releaseGates"]), "Duplicate release gate")
    for gate in gates.values():
        fail(gate["owner"] not in packages or not set(gate["requires"]) <= set(packages), "Unknown release-gate dependency")
    for path in plan["designReadiness"]["existingInputs"]:
        fail(not (root / path).exists(), f"Missing design input: {path}")
    supplementary = plan["supplementalCases"]
    fail(len({x["id"] for x in supplementary}) != len(supplementary), "Duplicate supplemental case")
    for case in supplementary:
        case_suites = [case["suite"], *case["additionalSuites"]]
        owners_and_suites(case["owner"], case_suites)
        required = {case["owner"]} | set(case["requiredProductionPackages"]) | {suites[sid]["owner"] for sid in case_suites}
        fail(set(case["testReadyAfter"]) != required or not required <= set(packages),
             f"Missing supplemental test readiness dependency: {case['id']}")
        fail(case["fullClosureGate"] not in gates, f"Unknown closure gate: {case['id']}")
        fail(any(not case[k] for k in ("given", "when", "then")), f"Incomplete supplement: {case['id']}")

    # Names alone cannot satisfy coverage: every row has a test boundary, owner,
    # disposition, and explicit still-planned status, with live contract set equality.
    all_rows = [*states.values(), *edges.values(), *rejects.values(), *case_assignments.values(), *actor_assignments.values()]
    fail(any(x["status"] != "planned" for x in all_rows), "Coverage contains an unproven implementation status")
    fail(len({x["testId"] for x in [*states.values(), *edges.values(), *rejects.values()]})
         != len(states) + len(edges) + len(rejects), "Duplicate state/edge/rejection test identity")

    plan_lines = [
        "# Vidra workflow implementation plan", "",
        f"**Date:** {plan['date']}. **Baseline:** `{plan['baselineCommit']}`. **Status:** all work packages are planned. This document does not implement the redesigned workflow.", "",
        f"The plan has **{len(packages)} work packages and {sum(len(x['commits']) for x in packages.values())} small implementation commits**, with explicit prerequisites and acceptance. WP identifiers are local planning IDs, not GitHub issue numbers.", "",
        f"Coverage assigns all **{len(states)} states, {len(edges)} declared transitions, {len(rejects)} rejected state/action pairs, {len(cases)} original acceptance cases and {len(actor_assignments)} reused state-group actors**. {len(supplementary)} additional cases cover implementation-specific rendering, commerce and cutover requirements. None is claimed to be a passing application test yet.", "",
        "Read [the behavior contract](workflow-state-contract.md), [source/test disposition inventory](implementation-source-inventory.md), [complete state/transition coverage](implementation-coverage.md), [acceptance test assignments](implementation-tests.md), and [renderer decisions/evidence](video-export-implementation-research.md).",
        "",
        "The authoritative plan data is `implementation-plan.json`. Run `python3 docs/design/workflow/validate_implementation_plan.py` to verify coverage, paths, test ownership, dependency acyclicity and generated-document drift. `--write` regenerates these readable files.", "",
        "## What stays, changes, and is new", "",
    ]
    plan_lines += table(["Disposition", "Implementation decision"], [
        ["Keep", "Authentication SDK; aiService; span labeling/refinement; actual provider input shaping; owned media and grants; durable receipts/attachments; proven player/seek/fullscreen; bounded Sketch loop; Page 21 primitives; legacy refund obligations."],
        ["Keep and extend", "Receipt authority and native workers with durable attempt evidence; immutable media/provenance with project destinations; upload admission with persistent staging/audio; observed results with uniform slots/recovery."],
        ["Replace", "Starting-frame inference of task; one workspace stage; job-gated/fragmented drafts; Studio viewer-as-edit-source; whole-thread implicit context; automatic stale-job/provider retry; unsafe sign-in replay; old share/trash semantics."],
        ["Build", "Project/conversation envelopes, execution-draft revision protocol, exact branch context, customer usage/entitlements, durable clarifications, recovery inbox, small composition editor, real renderer and isolated export deployment."],
    ])
    plan_lines += ["The source inventory names the exact existing modules/tests and their limitations. A current test that enforces a rejected workflow is replaced with the new behavior's test in the same implementation work; ownership, identity, data and refund protection tests remain.", "",
                   "## Ready to start Figma design", "",
                   "WP-12 can begin now from the behavior contract, state map, acceptance cases and existing Page 21 components. Schema and test-harness implementation are not design prerequisites. Start with linked wireframes; approval of a replacement layout remains required before its production UI implementation.", "",
                   "Decide during that first design pass:", ""]
    plan_lines += ["- " + choice for choice in plan["designReadiness"]["decideInFigma"]] + ["",
                   "Map backend states to understandable status/actions and reusable component variants. The 126 internal states do not require 126 full-page mockups. Cover combinations that can coexist, such as viewing an older result while a new draft is edited and another request finishes.", "",
                   "## Architecture decisions for implementation", ""]
    for decision in plan["architectureDecisions"]:
        plan_lines += [f"### {decision['title']}", "", decision["decision"], ""]
    plan_lines += ["## Dependencies and safe order", "",
                   "These are engineering dependencies, not a sequence imposed on creators. Packages in one wave have their prerequisites available; overlapping files/registrations still require one integration owner. The shared schemas, container/route registration, cross-mode harness and common native worker files are serialized when touched by more than one package.", ""]
    plan_lines += table(["Wave", "Ready packages", "Result"], [
        [str(i), ", ".join(wave), "; ".join(packages[k]["title"] for k in wave)]
        for i, wave in enumerate(waves, 1)
    ])
    plan_lines += ["WP-25 builds/tests adoption and writer-switch machinery on fixture copies. Production adoption belongs to WP-26 after WP-24 and G-ADOPTION; this avoids a validation/cutover dependency cycle. WP-21 produces the real renderer/reference frames before WP-20's editor parity gate.", "",
                   "## Work packages", ""]
    for package in packages.values():
        plan_lines += [f"### {package['id']} — {package['title']}", "",
                       f"**Owner:** {package['owner']}. **Depends on:** {', '.join(package['dependsOn']) or 'none'}. **Status:** planned.", ""]
        if package.get("entryCriteria"):
            plan_lines += ["**Entry criteria:**", ""] + ["- " + item for item in package["entryCriteria"]] + [""]
        for key, label in (("keep", "Keep"), ("replace", "Replace"), ("build", "Build")):
            plan_lines += [f"**{label}:** " + " ".join(package[key]), ""]
        plan_lines += ["**Existing code boundaries:** " + ", ".join(f"`{p}`" for p in package["existingAreas"]) + ".", "",
                       "**New proposed boundaries:** " + ", ".join(f"`{p}`" for p in package["newAreas"]) + ". These paths are planned, not existing implementation claims.", "",
                       "**Small commits:**", ""]
        plan_lines += [f"{i}. {step}" for i, step in enumerate(package["commits"], 1)] + [""]
        plan_lines += ["**Acceptance:**", ""] + [f"- {item}" for item in package["exitCriteria"] + package["testFocus"]] + [""]
        plan_lines += ["**Primary original case IDs:** " + (", ".join(package["caseIds"]) or "No original case is uniquely owned here; infrastructure/design/release acceptance is specified above and in supplemental cases/gates.") + ".", "",
                       "**Rollback:** " + package["rollback"], ""]
    plan_lines += ["## Tests and package completion", "", plan["coverageSemantics"], ""]
    plan_lines += [f"- {item}" for item in plan["definitionOfDone"]] + [""]
    plan_lines += ["Required commands use the existing repository tools:", "",
                   "```bash", "python3 docs/design/workflow/validate_contract.py",
                   "python3 docs/design/workflow/validate_implementation_plan.py",
                   "npx vitest run <owned-test-paths> --config config/test/vitest.unit.config.js",
                   "npx vitest run <owned-integration-paths> --config config/test/vitest.integration.config.js",
                   "npm run verify", "npm run lint:all", "npm run build",
                   "npm run verify:drift",
                   "PORT=0 npx vitest run tests/integration/bootstrap.integration.test.ts tests/integration/di-container.integration.test.ts --config config/test/vitest.integration.config.js",
                   "```", "",
                   "The last two checks apply when their route/catalog/flag and registration/lifecycle boundaries change. WP-02 defines the actual provider-free browser invocation and emulator launch/profile from the existing harness; the final plan never treats the currently occupied fixed port or an absent emulator as a passing check. Real-render tests run in the pinned renderer image, with no generation API keys or network calls.", "",
                   "## Activation gates", ""]
    plan_lines += table(["Gate", "Owner / prerequisites", "Required evidence"], [
        [g["id"], g["owner"] + " / " + ", ".join(g["requires"]), g["condition"] + " " + g["evidence"]]
        for g in plan["releaseGates"]
    ])
    plan_lines += ["The plan fixes behavior and technical defaults while leaving external authorizations/data explicit. Exact production pricing, real provider costs, observed render capacity, live creative quality, reviewed visual frames and permission to execute production adoption cannot be invented by a planning document. Missing evidence blocks the corresponding offering/gate; its application behavior is still defined as unavailable or unqualified.", "",
                   "## Initial export profile", "",
                   "The concrete renderer profile is recorded in `implementation-plan.json` and explained with primary sources in [the export research](video-export-implementation-research.md). It starts with three 1080-class MP4 presets, 30 fps, 48 kHz audio, 60-second output, 32 visual items and 100 text cues. One render per 2-vCPU/4-GiB instance, bounded scratch/output, two maximum instances and captured 9/10/11-minute attempt/task/service limits must pass the actual container/staging tests before exposure. These are limits to qualify, not measured capacity promises.", "",
                   "The actual qualification tolerances are fixed before implementing parity checks:", ""]
    parity = plan["renderProfile"]["parityTolerance"]
    plan_lines += table(["Measurement", "Acceptance threshold"], [
        ["Cut/cue frame-boundary error", str(parity["frameBoundaryErrorFrames"]) + " frames"],
        ["Pre-encode caption overlay difference", str(parity["preEncodeCaptionOverlayPixelDifference"]) + " pixels"],
        ["Crop rectangle geometry error", str(parity["cropRectangleErrorOutputPixels"]) + " output pixels"],
        ["Decoded 8-bit channel error on fixed lossless fixtures", "Mean absolute ≤ " + str(parity["maxDecodedVideoMeanAbsoluteChannelError8Bit"]) + "; 99th percentile absolute ≤ " + str(parity["maxDecodedVideoAbsoluteChannelError99Percentile8Bit"])],
        ["Audio impulse timing after measured encoder-priming alignment", "≤ " + str(parity["audioImpulseTimingErrorSamplesAfterPrimingAlignment"]) + " samples at 48 kHz"],
        ["Audio gain error", "≤ " + str(parity["audioGainErrorDb"]) + " dB"],
    ])
    plan_lines += [parity["evaluation"], "",
                   "Initial encoding: MP4/faststart, libx264 medium/CRF 18, yuv420p SDR BT.709, AAC stereo 192k at 48 kHz. These settings and their exact binary/font versions are captured by the renderer manifest; do not silently change them for already accepted exports.", "",
                   "## Current implementation status", "",
                   "This work produces an implementation plan, coverage ledger and executable plan checker. All package/test/coverage statuses remain planned. Existing application tests do not close the new cases. Figma design (WP-12) can begin now. Engineering starts with WP-01 followed by WP-02 and can proceed independently of design where its own dependencies permit; new UI compositions still require reviewed designs.", ""]
    verification = plan["planVerification"]
    plan_lines += ["## Verification of the plan", "",
                   f"Recorded {verification['date']} against source baseline `{verification['sourceBaseline']}`.", "",
                   verification["planCheck"], "", verification["faultCheck"], "",
                   verification["baselineCheck"], "", verification["warnings"], "",
                   verification["limits"], ""]

    coverage_lines = ["# Implementation coverage for every workflow state", "",
                      "Generated from `implementation-plan.json` and checked against `state-model.json`. Every status here is **planned**, not implemented or tested in the application.", "",
                      f"**{len(states)} states · {len(edges)} declared transitions · {len(rejects)} rejected pairs · {len(actor_assignments)} action adapters.** No state/pair may disappear from this ledger when the behavior model changes; the checker fails until the plan is amended.", "",
                      "KEEP preserves a proven lower-level boundary and retests its new use. EXTEND retains its owner while adding behavior. REPLACE changes contradictory behavior. NEW has no active implementation. See [source evidence](implementation-source-inventory.md) and [package dependencies](implementation-plan.md).", ""]
    for name, state_model in models.items():
        coverage_lines += [f"## {name.replace('_', ' ').capitalize()}", "",
                           "**Whole-group application conformance is ready after:** " + ", ".join(plan["stateGroupTestReadyAfter"][name]) + ". Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.", ""]
        coverage_lines += table(["State", "Owner", "Disposition", "Implementation boundary", "Required test", "Rationale"], [
            [f"`{state}`", states[name, state]["owner"], states[name, state]["disposition"],
             f"`{states[name, state]['implementation']}`", states[name, state]["testId"] + "; " + ", ".join(states[name, state]["suites"]), states[name, state]["reason"]]
            for state in state_model["states"]
        ])
        coverage_lines += table(["From / event → to", "Owner", "Rule", "Test ID / suite"], [
            [f"{t['from']} / {t['event']} → {t['to']}", t["owner"], t["rule"], t["testId"] + "; " + t["suite"]]
            for t in edges.values() if t["model"] == name
        ])
        coverage_lines += ["**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.", ""]
        coverage_lines += table(["State", "Owner / suite", "Events that must reject"], [
            [state, states[name, state]["owner"] + " / " + states[name, state]["suites"][0],
             ", ".join(x["event"] for x in rejects.values() if x["model"] == name and x["state"] == state) or "None in declared vocabulary; unknown events still reject."]
            for state in state_model["states"]
        ])
    coverage_lines += ["## Shared state groups used by different actions", "",
                       "Test each real adapter, including its inapplicable-event rejections and side effects. A generic state reducer passing once is insufficient for export, Sketch, assistance and video generation.", ""]
    coverage_lines += table(["Action adapter", "Owner", "State groups", "Required suite"], [
        [a["actor"], a["owner"], ", ".join(a["models"]), a["suite"]] for a in actor_assignments.values()
    ])

    test_lines = ["# Implementation acceptance-test plan", "",
                  f"All **{len(cases)} original cases** are assigned below. **{len(supplementary)} additional implementation cases** cover requirements that need concrete renderer/commerce/cutover choices. Every suite/path is planned unless separately backed by execution evidence.", "",
                  "Original Given/When/Then remain in [acceptance-cases.md](acceptance-cases.md). The test title must contain its case ID. TestReadyAfter includes both suite owners and the later production boundaries required by the full scenario; their transitive prerequisites also apply. Local contract proof can land earlier, but the full case stays open until all required suites pass. G-APP is the full application closure gate; hosted/activation cases have their own stated gates.", "",
                  "## Original case ownership", ""]
    test_lines += table(["Case", "Owner", "Suites", "TestReadyAfter", "Observable acceptance"], [
        [a["caseId"], a["owner"], ", ".join(a["suites"]), ", ".join(a["testReadyAfter"]), cases[a["caseId"]]["then"]]
        for a in case_assignments.values()
    ])
    test_lines += ["## Additional cases", ""]
    for case in supplementary:
        all_suites = [case["suite"], *case["additionalSuites"]]
        test_lines += [f"### {case['id']} — {case['owner']} / {', '.join(all_suites)}", "",
                       f"**Given:** {case['given']}", "", f"**When:** {case['when']}", "",
                       f"**Then:** {case['then']}", "", f"**TestReadyAfter:** {', '.join(case['testReadyAfter'])}. **Closure:** {case['fullClosureGate']}. Status: planned.", ""]
    test_lines += ["## Planned test boundaries and files", ""]
    test_lines += table(["Suite", "Owner / level", "Planned path", "Required assertions"], [
        [s["id"], s["owner"] + " / " + s["layer"], f"`{s['path']}`", s["contract"]]
        for s in suites.values()
    ])
    test_lines += ["## Evidence required to mark a case passed", "",
                   "Record case/state/edge ID, implementation commit, real test path/title, profile (unit/integration/emulator/browser/real-process/hosted), fixture and catalog versions, result, skips, and artifact/log location. The actual test must reach the production command boundary; it must not just execute the design JSON or assert that its labels are present. For rejected/race paths, also assert unchanged owned data and provider/process/financial effect counts.", "",
                   "No current application pass is claimed by this plan checker. Update completion evidence only after running the required tests against the implemented revision.", ""]

    for name, lines in (("implementation-plan.md", plan_lines),
                        ("implementation-coverage.md", coverage_lines),
                        ("implementation-tests.md", test_lines)):
        expected = "\n".join(lines)
        path = root / name
        if args.write:
            path.write_text(expected)
        else:
            fail(not path.exists() or path.read_text() != expected,
                 f"Generated file drift: {name}; regenerate with --write")

    print(json.dumps({"packages": len(packages), "small_commits": sum(len(p["commits"]) for p in packages.values()),
                      "dependency_waves": len(waves), "states_assigned": len(states),
                      "transitions_assigned": len(edges), "rejected_pairs_assigned": len(rejects),
                      "original_cases_assigned": len(cases), "supplemental_cases": len(supplementary),
                      "actor_adapters_assigned": len(actor_assignments), "planned_test_suites": len(suites),
                      "application_tests_executed_by_checker": 0}))


if __name__ == "__main__":
    main()
