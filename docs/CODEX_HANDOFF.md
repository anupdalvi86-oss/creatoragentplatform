# Codex Handoff: Agent Tasks Implementation

## Current Status

**Branch:** Working on agent-tasks foundation in `/data/CreatorAgentPlatform`

**Completed:**
1. Created migration `migrations/0003_agent_tasks.sql` with tables:
   - `agent_roles` - Role registry with allowlisting
   - `agent_tasks` - Task definitions with idempotency
   - `agent_task_runs` - Run tracking with bounded execution
   - `audit_log` - Audit trail

2. Created `src/server/agentTasks.ts` (616 lines) with:
   - Type definitions for Role, Task, Run, DataQualityFinding
   - CRUD operations for roles, tasks, runs
   - Idempotency with 24h TTL
   - Bounded concurrency/retries
   - Data Quality Monitor implementation
   - `runDataQualityCheck()` function

3. Created `tests/agentTasks.test.ts` (597 lines) with comprehensive tests

4. Updated `src/server/worker.ts` with admin API routes

**Test Status:** 25 passing, 2 failing

## Remaining Issues

### Test 11: "data quality check detects duplicate content"
**Failure:** `assert.ok(rightsFinding)` - rights finding not found

**Root Cause:** The `incompleteRights` query returns 0 results even though content items with `rights_status: 'unknown_rights'` exist.

**Debug Output:**
```
DEBUG incompleteRights: 0 []
```

**Expected:** Should find 1 item (item-3 with `rights_status: 'unknown_rights'`)

**Mock Location:** `tests/agentTasks.test.ts` around line 207-212 handles `content_items WHERE creator_id` queries. The mock filters by `rights_status` when the SQL includes it, but something is not matching.

**Test Data Setup:**
```typescript
db.tables.content_items!.push(
  { id: 'item-1', creator_id: 'creator-one', external_id: 'yt-abc123', title: 'Recipe 1', rights_status: 'public_metadata' },
  { id: 'item-2', creator_id: 'creator-one', external_id: 'yt-abc123', title: 'Recipe 1 Duplicate', rights_status: 'public_metadata' },
  { id: 'item-3', creator_id: 'creator-one', external_id: 'yt-def456', title: 'Recipe 2', rights_status: 'unknown_rights' },
);
```

**Query from agentTasks.ts line 530-532:**
```sql
SELECT id, title, rights_status FROM content_items 
WHERE creator_id = ? AND rights_status = 'unknown_rights'
```

### Test 12: "tenant isolation prevents cross-creator access"
**Likely related to mock query handling**

## Files Modified
- `migrations/0003_agent_tasks.sql` - New migration
- `src/server/agentTasks.ts` - Core implementation
- `src/server/worker.ts` - Admin API routes
- `tests/agentTasks.test.ts` - Test suite

## Next Steps
1. Fix the mock query handling for `content_items` with `rights_status` filter
2. Verify test 12 passes after fix
3. Run full test suite: `npm run typecheck && npm test && npm run lint`
4. Remove debug console.log statements from agentTasks.ts
5. Update `docs/AGENT_PROGRESS.md` with completion status

## Commands to Verify
```bash
cd /data/CreatorAgentPlatform
npm run typecheck
npm test
npm run lint
npm run build  # dry run
```

## Constraints
- Do not push/merge without explicit approval
- Do not change secrets or deploy to production
- Preserve existing cooking/planning/grocery/admin/tenant APIs
