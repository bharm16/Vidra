#!/usr/bin/env python3
"""Validate the design model, not the Vidra application's implementation.

--write refreshes the human-readable state map and acceptance list.
The default checks those generated files for drift without modifying them.
Only the Python standard library is required. No network or provider calls.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import deque
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    spec = (root / "workflow-state-contract.md").read_text()
    data = json.loads((root / "state-model.json").read_text())
    acceptance = json.loads((root / "acceptance-cases.json").read_text())
    declared_rules = set(re.findall(r"\*\*([A-Z]\d{2})(?=[: —])", spec))
    if not declared_rules:
        raise ValueError("No contract rules found")
    if data["defaultTransition"]["mutates"] or data["unknownEvent"]["mutates"]:
        raise ValueError("Default/unknown events must never mutate state")

    models: dict[str, dict] = {}
    matrices: dict[str, dict] = {}
    states_total = transitions_total = pairs_total = rejected_total = 0
    for model in data["models"]:
        name = model["id"]
        if name in models:
            raise ValueError(f"Duplicate state group: {name}")
        models[name] = model
        states = model["states"]
        if model["initial"] not in states:
            raise ValueError(f"Unknown initial state: {name}")
        if len(model["events"]) != len(set(model["events"])):
            raise ValueError(f"Duplicate event declaration: {name}")
        index: dict[tuple[str, str], dict] = {}
        for transition in model["transitions"]:
            source, event, target = (
                transition["from"], transition["event"], transition["to"]
            )
            if source not in states or target not in states:
                raise ValueError(f"Undefined state: {name}: {transition}")
            if event not in model["events"]:
                raise ValueError(f"Undefined event: {name}: {event}")
            if transition["rule"] not in declared_rules:
                raise ValueError(f"Unknown rule: {name}: {transition['rule']}")
            if (source, event) in index:
                raise ValueError(f"Nondeterministic transition: {name}/{source}/{event}")
            if source in model["terminal"] and target != source:
                raise ValueError(f"Terminal state has an exit: {name}/{source}")
            index[source, event] = transition

        declared_events = set(model["events"])
        used_events = {transition["event"] for transition in index.values()}
        if declared_events != used_events:
            raise ValueError(f"Event vocabulary drift: {name}")
        if not set(model["terminal"]).issubset(states):
            raise ValueError(f"Unknown terminal state: {name}")

        reachable = {model["initial"]}
        queue = deque(reachable)
        while queue:
            source = queue.popleft()
            for event in model["events"]:
                transition = index.get((source, event))
                if transition and transition["to"] not in reachable:
                    reachable.add(transition["to"])
                    queue.append(transition["to"])
        if reachable != set(states):
            raise ValueError(f"Unreachable states: {name}: {set(states) - reachable}")

        # Materialize every declared state/event pair. Missing named edges are
        # explicit rejected no-ops under the model's documented default policy.
        matrix = {}
        for source in states:
            for event in model["events"]:
                transition = index.get((source, event))
                matrix[source, event] = (
                    ("apply", transition["to"])
                    if transition
                    else ("reject", source)
                )
                if not transition:
                    rejected_total += 1
                    if matrix[source, event][1] != source:
                        raise ValueError("Rejected event mutated state")
        matrices[name] = matrix
        states_total += len(states)
        transitions_total += len(index)
        pairs_total += len(matrix)

    case_ids = set()
    covered_rules = set()
    for case in acceptance["cases"]:
        if case["id"] in case_ids:
            raise ValueError(f"Duplicate acceptance ID: {case['id']}")
        case_ids.add(case["id"])
        for field in ("given", "when", "then", "rules"):
            if not case[field]:
                raise ValueError(f"Empty {field}: {case['id']}")
        if not set(case["rules"]).issubset(declared_rules):
            raise ValueError(f"Unknown acceptance rule: {case['id']}")
        covered_rules.update(case["rules"])
    if covered_rules != declared_rules:
        raise ValueError(f"Contract rules without acceptance cases: {declared_rules - covered_rules}")

    trace_ids = set()
    for trace in acceptance["modelTraces"]:
        if trace["id"] in trace_ids:
            raise ValueError(f"Duplicate trace ID: {trace['id']}")
        trace_ids.add(trace["id"])
        name = trace["model"]
        state = models[name]["initial"]
        for event in trace["events"]:
            disposition, next_state = matrices[name][state, event]
            if disposition != "apply":
                raise ValueError(f"Trace rejected: {trace['id']}/{state}/{event}")
            state = next_state
        if state != trace["expected"]:
            raise ValueError(f"Trace outcome mismatch: {trace['id']}: {state}")

    state_lines = [
        "# Workflow state map", "",
        "Generated from `state-model.json`. Edit that file, then run `python3 docs/design/workflow/validate_contract.py --write`.", "",
        f"**{len(models)} state groups · {states_total} named states · {transitions_total} declared transitions · {pairs_total} state/event pairs.**",
        "",
        "Every pair without a declared transition is an explicit rejected no-op. Unknown events also reject without mutation. User commands show a reason; stale/system observations preserve state and are logged. Guards and cross-group effects are defined by the referenced rules in [the contract](workflow-state-contract.md).",
        "",
        "These groups are independent and can coexist. Export uses the submission/request/output/attachment/cancellation/usage groups with a captured video-edit revision. There is no global project stage.",
        "",
        "The checker establishes finite-model structure and trace behavior. Cross-group acceptance cases remain specifications until application tests implement them.",
        "",
    ]
    for model in data["models"]:
        state_lines += [f"## {model['id'].replace('_', ' ').capitalize()}", "",
                        f"Initial state: `{model['initial']}`.", "",
                        "<!-- prettier-ignore -->",
                        "| State | Meaning |", "| --- | --- |"]
        state_lines += [f"| `{key}` | {value} |" for key, value in model["states"].items()]
        state_lines += ["", "<!-- prettier-ignore -->", "| From | Event | To | Contract rule |", "| --- | --- | --- | --- |"]
        state_lines += [f"| `{t['from']}` | `{t['event']}` | `{t['to']}` | {t['rule']} |" for t in model["transitions"]]
        state_lines += [""]

    case_lines = ["# Workflow acceptance cases", "",
                  "Generated from `acceptance-cases.json`; these are required behaviors, not claims of passing application tests.", "",
                  f"**{len(case_ids)} interaction cases and {len(trace_ids)} executable model traces.** Every named rule in [the contract](workflow-state-contract.md) is referenced by at least one case.", ""]
    group = None
    for case in acceptance["cases"]:
        prefix = case["id"].rsplit("-", 1)[0]
        if prefix != group:
            group = prefix
            case_lines += [f"## {prefix.capitalize()}", ""]
        case_lines += [f"### {case['id']} — {', '.join(case['rules'])}", "",
                       f"**Given:** {case['given']}", "",
                       f"**When:** {case['when']}", "",
                       f"**Then:** {case['then']}", ""]
    case_lines += ["## Executable model traces", "",
                   "These traces execute only the design model, not the application.", "",
                   "<!-- prettier-ignore -->",
                   "| Trace | State group | Events | Expected state |", "| --- | --- | --- | --- |"]
    case_lines += [f"| {t['id']} | `{t['model']}` | {' → '.join(t['events'])} | `{t['expected']}` |" for t in acceptance["modelTraces"]]
    case_lines += [""]

    for filename, lines in (("state-map.md", state_lines), ("acceptance-cases.md", case_lines)):
        output = "\n".join(lines)
        path = root / filename
        if args.write:
            path.write_text(output)
        elif not path.exists() or path.read_text() != output:
            raise ValueError(f"Generated document drift: {filename}; run with --write")

    print(json.dumps({"state_groups": len(models), "states": states_total,
                      "declared_transitions": transitions_total,
                      "state_event_pairs_checked": pairs_total,
                      "explicit_rejected_pairs": rejected_total,
                      "contract_rules_covered": len(covered_rules),
                      "acceptance_cases": len(case_ids), "model_traces_passed": len(trace_ids)}))


if __name__ == "__main__":
    main()
