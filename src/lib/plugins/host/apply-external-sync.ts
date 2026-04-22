import type {
  LegacySyncFetchResult,
  SyncTestCasesToDatabaseInput,
  SyncTestCasesToDatabaseResult,
} from "@/lib/plugins/types";
import type { HostBridge } from "./types";

export async function applyExternalTableSyncWithPersistence(
  port: HostBridge,
  input: SyncTestCasesToDatabaseInput,
  fetchResult: LegacySyncFetchResult,
): Promise<SyncTestCasesToDatabaseResult> {
  const {
    syncMode = "upsert",
    createTestSet: shouldCreateTestSet = true,
    testSetName,
    testSetDescription,
    appToken,
    tableId,
  } = input;

  if (!fetchResult.success || fetchResult.apiError) {
    return {
      success: false,
      stats: {
        total: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 1,
      },
      testSet: null,
      errors: [
        fetchResult.apiError ||
          fetchResult.nonFatalErrors[0] ||
          "External sync fetch failed",
      ],
    };
  }

  const rows = fetchResult.rows;
  const existing = await port.getAllTestCasesForSync();
  const existingTestIdMap = new Map(existing.map((tc) => [tc.test_id, tc]));

  let created = 0;
  let updated = 0;
  let skipped = fetchResult.rawRecordCount - rows.length;
  const errors: string[] = [...fetchResult.nonFatalErrors];
  const createdTestCaseIds: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const testCase = rows[i];
    try {
      const existingRow = existingTestIdMap.get(testCase.test_id);

      if (existingRow && syncMode !== "create_only") {
        await port.updateTestCase(existingRow.id, testCase);
        updated++;
        createdTestCaseIds.push(existingRow.id);
      } else if (!existingRow && syncMode !== "update_only") {
        const newTc = await port.createTestCase(testCase);
        created++;
        createdTestCaseIds.push(newTc.id);
        existingTestIdMap.set(testCase.test_id, {
          id: newTc.id,
          test_id: testCase.test_id,
        });
      } else if (existingRow) {
        createdTestCaseIds.push(existingRow.id);
        skipped++;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Row ${i + 1} (${testCase.test_id}): ${errorMsg}`);
    }
  }

  let testSet: {
    id: number;
    name: string;
    testCaseCount: number;
  } | null = null;

  if (shouldCreateTestSet && createdTestCaseIds.length > 0) {
    try {
      const dateStr = new Intl.DateTimeFormat(undefined, {
        dateStyle: "short",
      }).format(new Date());
      const defaultName =
        testSetName ||
        fetchResult.suggestedTestSetName ||
        `External sync - ${dateStr}`;

      testSet = await port.createTestSet(
        {
          name: defaultName,
          description:
            testSetDescription ||
            `Synced from external table — ${createdTestCaseIds.length} test case(s)`,
          source: "lark",
          source_url: `https://base.larkoffice.com/app/${appToken}/table/${tableId}`,
        },
        createdTestCaseIds,
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to create test set: ${errorMsg}`);
    }
  }

  return {
    success: true,
    stats: {
      total: fetchResult.rawRecordCount,
      created,
      updated,
      skipped,
      errors: errors.length,
    },
    testSet,
    errors: errors.slice(0, 10),
  };
}
