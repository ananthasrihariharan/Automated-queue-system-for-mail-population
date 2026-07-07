1. Dual-write still has no true distributed transaction because MongoDB commit happens before PostgreSQL commit, so permanent inconsistency windows still exist.

2. Read-fence guard reintroduces Mongo dependency during transition, meaning PostgreSQL is still not a fully authoritative source.

3. syncTimestamp using Date.now()*1000 + process.hrtime() is not globally monotonic across clustered Node.js processes or multiple servers.

4. BigInt logical timestamps can break ordering guarantees if multiple app instances generate writes concurrently without centralized clock coordination.

5. Shadow routing in jobWorkflow.js doubles execution cost because legacy and relational logic run simultaneously for every workflow operation.

6. Shadow mode JSON.stringify comparison can produce false mismatches when field ordering differs despite semantically identical results.

7. Queue subsystem moved earlier (R3c) but queueEngine.js is usually latency-sensitive and normalization may introduce unexpected websocket lag.

8. SessionPinnedJob and SessionPausedJob normalization can increase hot-path query count because queue sync loops probably run every few seconds.

9. QueueJobAttachmentMeta key-value table introduces unnecessary row explosion for metadata that was previously lightweight Map storage.

10. QueueJobAuditEntry.details as String loses schema flexibility and forces serialization/deserialization overhead for structured audit data.

11. ProcessVariant enum is still incomplete because real-world printing workflows may introduce new variants later requiring schema migrations.

12. JobItemProcess still contains side and subType as generic String fields, leaving partial schema ambiguity unresolved.

13. JobItemCornerDetail cornerPosition as String allows invalid values unless strict enum (TL/TR/BL/BR) is introduced.

14. ActiveDashboardCache adds denormalized write amplification because every workflow state transition now requires cache maintenance logic.

15. If ActiveDashboardCache update fails but primary write succeeds, dashboard data becomes stale unless transactional coupling is perfect.

16. SyncFailureQueue can grow indefinitely under repeated failures and there is no archival/cleanup retention strategy defined.

17. compareDbs.js hourly checksum scan on 1000 jobs may become expensive on production if each check reconstructs full adapted relational objects.

18. SHA256 stable hashing on large nested job documents adds CPU overhead during every dual-write operation.

19. Stable hash comparison can produce unnecessary drift alerts when Mongo stores fields differently than Prisma serialization.

20. Feature-flag rollback (WORKFLOW_ENGINE_MODE=legacy) only protects workflow engine and does not rollback schema-level relational decomposition already deployed.

21. API versioning strategy (/api/v1 and /api/v2) doubles backend maintenance burden because both response contracts must coexist for months.

22. Frontend screen-by-screen migration risks inconsistent behavior because different modules may simultaneously use v1 and v2 APIs.

23. Bulk Prisma createMany improves migration speed but does not return inserted IDs, making dependent child inserts harder to coordinate.

24. Cursor pagination batch migration can still lock memory if deeply nested job structures contain large embedded item arrays.

25. Specialized SQL tables eliminate JSON ambiguity but schema evolution becomes expensive because every new printing workflow variation requires migrations.

26. Removing prismaMongooseCompat.js completely may break undocumented legacy query assumptions hidden in old services.

27. PostgreSQL schema complexity is becoming very high (40+ tables) which significantly increases maintenance burden for a medium-sized ERP.

28. No explicit load testing plan exists for websocket-heavy modules like Queue and Dispatch under relational architecture.

29. Fail-fast architecture removes hidden bugs but production PostgreSQL outages now immediately break API availability because no degraded mode exists.

30. MongoDB kept as historical archive means long-term infrastructure duplication cost remains until final full retirement.