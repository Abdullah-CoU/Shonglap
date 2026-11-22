# Shonglap Routing Evaluation Report

Generated: 2026-11-22T04:25:47.750Z

## Summary

| Metric | Value |
|--------|-------|
| Total samples | 43 |
| Correct | 43 (100.0%) |
| Auto-routed | 17 (39.5%) |
| Triaged | 26 (60.5%) |
| Misrouted | 0 |

## Extraction Accuracy

| Metric | Correct | Total | Accuracy |
|--------|---------|-------|----------|
| Category | 43 | 43 | 100.0% |
| Area | 31 | 31 | 100.0% |

## With vs Without Photo

| Condition | Correct | Total | Accuracy |
|-----------|---------|-------|----------|
| With photo mention | 0 | 0 | 0% |
| Without photo mention | 43 | 43 | 100.0% |

## Confusion Matrix (Expected → Got)

| Expected \ Got | DNCC | DSCC | RHD | WASA | DESCO | DPDC | Titas | RAJUK | DMP | Traffic | DOE | Fire | triage | Police |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DESCO | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| DMP | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| DNCC | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| DOE | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 |
| DPDC | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| DSCC | 0 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Fire | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| RAJUK | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| RHD | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Titas | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Traffic | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| WASA | 0 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| triage | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 0 |
