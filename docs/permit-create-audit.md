# Permit creation audit — 4 November 2026

Scope: repository implementation and existing automated tests. No live SAP write or backend business-rule verification was performed. Requirements below describe the current application, not an independent certification of the site's procedure.

Update after user review: supervisor name, supervisor phone and crew are now optional at creation. Their required markers and creation blockers have been removed. Crew quantity remains calculated from added workers and may be zero; added workers still require valid details. A supplied supervisor phone is still format-checked. Safety officer and requester comments remain optional. The audit below records the original behavior before this change.

## Process

1. Select a confirmed SAP maintenance order or notification. Reference data populates plant, equipment, functional location and job information.
2. Complete General Details.
3. Complete Client Procedure and category-specific planning.
4. Add crew members.
5. Add PPE and answer category compliance questionnaires.
6. Add hazards, controls and risk assessment.
7. Review isolation/gas prerequisites.
8. Review and submit. All steps are checked again, followed by `preparePermitCreate`, schema serialization and a deep-insert POST.

SAP must return a permit number and the expected status. An uncertain save blocks another submission until the user checks SAP. Ordinary initial status comes from prerequisite rules; pure cold work explicitly requests APPR. That special status path should be considered when reviewing approval behavior. Isolation certificates and actual gas-test evidence use separate workflows.

## Mandatory fields

| Step | Required by current implementation |
| --- | --- |
| Work selection | Confirmed SAP order or notification; plant (`Werks`) is required by payload validation. |
| General details | Permit category, job description, work area (`AreaLoc`), supervisor name and phone, execution department, start date/time and end date/time, explicit gas-testing and isolation choices. Functional location (`Tplnr`) itself is not checked for nonempty content. |
| Execution target | Executing sub working plant when the selected department has configured plant options. |
| Client procedure | At least one nature of work and one tool/equipment; signed JSA reference; JSA team/site-visit notes; planned shift end; proposed issuer, acceptor and area operator SAP IDs. Issuer and acceptor must differ. |
| Crew | At least one worker; worker name and phone; employee ID for EMP, contractor company for CONT. Crew count must equal worker count. |
| PPE | At least one item with PPE code and description. |
| Compliance questionnaires | Every question returned for each active category must have an answer. Production blocks unavailable questionnaires, including empty required HOT/CSE/W@H/ELEC questionnaires. |
| Hazards | At least one hazard with hazard description and control description. The UI supplies the selected risk-matrix value; it does not require a separate explicit risk-selection acknowledgment. |

Phone validation accepts 10–15 digits with permitted formatting, despite several labels saying “10 digits.” End must follow start, remain in the future, and be within eight hours of start and no later than shift end. Times are interpreted in IST.

## Conditional requirements

| Condition | Additional requirements |
| --- | --- |
| Hot work | Fire-watch name and phone; gas testing Yes; retest interval 1 or 2 hours. |
| Confined-space entry | Standby name and phone; rescue-plan reference; gas testing Yes and 1/2-hour retest; positive isolation. |
| Rigging | Rigging-plan and approval reference. |
| Other category | Scope and controls. |
| Other nature/tool | Descriptive text, either dedicated Other text or preparation notes. |
| Isolation Yes | Current UI requires certificate number before submission; see finding 1. |
| Gas testing Yes | Retest interval 1 or 2 hours, regardless of category. |
| Preparation response N/A | Explanation in remarks. |

Approver I/II/III IDs, safety officer, isolation drawing, lifting load, excavation depth, chemical content and supporting radiation permit reference are not marked required by the current planning-field definitions. Their labels or relevance must not be mistaken for enforced mandatory rules.

## Findings

### 1. Isolation certificate sequencing conflicts — high priority

`PermitCreateModule.tsx:1701` and `:2048` block submission without an isolation certificate number when isolation is selected. The same screen at `:4763` says to create the permit first and then create the certificate using its returned number. `permitCreate.validation.ts` also rejects embedded isolation points during creation. A user following the new-certificate route cannot satisfy both instructions without entering an unrelated or invented reference.

Recommendation: distinguish linking an existing certificate from planning a new one; require its number only for the existing-certificate route.

### 2. Validation changes form state during rendering — high priority

`blockingValidation` calls `validateTab` inside `useMemo` (`PermitCreateModule.tsx:2404`). That validator adds workers, PPE and hazards and clears entry fields (`:1897`, `:1931`, `:2010`). Merely typing complete values can therefore add rows automatically during rendering. Submission also validates before using a payload built from the prior render, so state queued by validation is not guaranteed to be present in that payload.

Recommendation: make validation read-only; commit rows through explicit add/next actions before building and validating the final payload.

### 3. Payload validation does not enforce all UI requirements — medium priority

`preparePermitCreate` requires workers and hazards but not a nonempty PPE list, supervisor phone, worker phone or complete category questionnaires. It checks only supplied `_CHK` rows for nonempty answers, not the expected questions or allowed answer values. `validateSitePermit` returns immediately when `_Safety` lacks DOCV (`siteProcedure.ts:250`), bypassing its category, JSA, role, eight-hour and category gas/isolation checks. This is explicitly labeled legacy compatibility in the source.

Impact: the current wizard has stronger checks than the shared payload entry point. Other callers can build requests that violate wizard requirements. SAP may reject them; backend enforcement was not verified.

Recommendation: centralize business validation and explicitly constrain any legacy compatibility route. Keep authoritative validation in SAP as well.

### 4. Preparation responses can be manufactured from unanswered inputs — medium priority

`sitePlanRows` defaults a missing preparation response to NO (`siteProcedure.ts`, preparation-row construction). `validateSitePermit` accepts YES, NO or NA and requires remarks only for NA. Consequently, a blank preparation answer becomes a valid NO, so this check cannot prove that the user reviewed each item.

Recommendation: preserve unanswered state and require an explicit choice if review is mandatory. Separately define which negative responses may block creation versus later issuance.

## Verification

65 existing tests passed across permit validation navigation, site procedure, phone validation, prerequisites, category questionnaires and work lookup. These tests do not establish that the identified gaps are covered or that live SAP enforces the missing rules. Application code was not changed.

Primary sources: `src/features/permits/PermitCreateModule.tsx`, `src/core/api/modules/permitCreate.validation.ts`, `src/core/api/modules/permitCreate.api.ts`, `src/core/ptw/siteProcedure.ts`, `src/core/utils/phoneValidation.ts`.
