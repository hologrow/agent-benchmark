import { NextRequest, NextResponse } from 'next/server';
import { prepareImportPlugin } from '@/lib/plugins/route-utils';
import {
  hasImportSchemaMethods,
  type ImportTestCasesPlugin,
} from '@/lib/plugins/types';

const IMPORT_ACTIONS = [
  'listImportSources',
  'listImportTables',
  'listImportFields',
  'importTestCases',
] as const;

type ImportAction = (typeof IMPORT_ACTIONS)[number];

function isImportAction(s: string): s is ImportAction {
  return (IMPORT_ACTIONS as readonly string[]).includes(s);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pluginId: string }> },
) {
  const { pluginId } = await params;
  try {
    const prepared = prepareImportPlugin(pluginId);
    if (!prepared.ok) {
      return prepared.response;
    }

    const body = (await request.json()) as {
      action?: string;
      payload?: Record<string, unknown>;
    };
    const { action, payload = {} } = body;

    if (!action || typeof action !== 'string') {
      return NextResponse.json(
        { error: 'Missing "action" in body', allowed: [...IMPORT_ACTIONS] },
        { status: 400 },
      );
    }

    if (!isImportAction(action)) {
      return NextResponse.json(
        { error: `Unknown action: ${action}`, allowed: [...IMPORT_ACTIONS] },
        { status: 400 },
      );
    }

    return await handleImportAction(prepared.plugin, action, payload);
  } catch (error) {
    console.error(`[plugins/${pluginId}]`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: 500 },
    );
  }
}

async function handleImportAction(
  plugin: ImportTestCasesPlugin,
  action: ImportAction,
  payload: Record<string, unknown>,
): Promise<NextResponse> {
  switch (action) {
    case 'listImportSources': {
      if (!hasImportSchemaMethods(plugin)) {
        return NextResponse.json(
          { error: 'Plugin does not support listImportSources' },
          { status: 501 },
        );
      }
      const sources = await plugin.listImportSources();
      return NextResponse.json({ sources });
    }

    case 'listImportTables': {
      if (!hasImportSchemaMethods(plugin)) {
        return NextResponse.json(
          { error: 'Plugin does not support listImportTables' },
          { status: 501 },
        );
      }
      const sourceId = typeof payload.sourceId === 'string' ? payload.sourceId : '';
      if (!sourceId) {
        return NextResponse.json(
          { error: 'payload.sourceId is required' },
          { status: 400 },
        );
      }
      const tables = await plugin.listImportTables(sourceId);
      return NextResponse.json({ tables });
    }

    case 'listImportFields': {
      if (!hasImportSchemaMethods(plugin)) {
        return NextResponse.json(
          { error: 'Plugin does not support listImportFields' },
          { status: 501 },
        );
      }
      const sourceId = typeof payload.sourceId === 'string' ? payload.sourceId : '';
      const tableId = typeof payload.tableId === 'string' ? payload.tableId : '';
      if (!sourceId || !tableId) {
        return NextResponse.json(
          { error: 'payload.sourceId and payload.tableId are required' },
          { status: 400 },
        );
      }
      const fields = await plugin.listImportFields(sourceId, tableId);
      return NextResponse.json({ fields });
    }

    case 'importTestCases': {
      const items = payload.items;
      const fieldMapping = payload.fieldMapping as Record<string, string> | undefined;
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json(
          { error: 'payload.items must be a non-empty array' },
          { status: 400 },
        );
      }
      const result = await plugin.importItems(
        items.map(String),
        fieldMapping,
      );
      return NextResponse.json(result);
    }

    default:
      return NextResponse.json({ error: 'Unreachable' }, { status: 500 });
  }
}
