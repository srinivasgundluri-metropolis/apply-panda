import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const requiredApiFiles = [
  'app/api/applications/route.ts',
  'app/api/applications/[num]/route.ts',
  'app/api/profile/route.ts',
  'app/api/cv/route.ts',
  'app/api/reports/route.ts',
  'app/api/reports/[num]/route.ts',
  'app/api/scan-history/route.ts',
  'app/api/scan-history/status/route.ts',
  'app/api/output/route.ts',
  'app/api/files/[...path]/route.ts',
  'app/api/chat/stream/route.ts',
  'app/api/eval/stream/route.ts',
  'app/api/docs/generate/route.ts',
  'app/api/docs/persist-artifact/route.ts',
  'app/api/resume-context/apply/route.ts',
  'app/api/scan/run/route.ts',
  'app/api/jd/route.ts',
];

const scopedByDelegate = {
  'app/api/applications/route.ts': ['readApplications('],
  'app/api/applications/[num]/route.ts': ['patchApplicationRow('],
  'app/api/profile/route.ts': ['readProfile(', 'writeProfile('],
  'app/api/reports/route.ts': ['listReports('],
  'app/api/reports/[num]/route.ts': ['findReportByNum(', 'parseReportFromPath('],
  'app/api/scan-history/route.ts': ['readScanHistory('],
  'app/api/scan-history/status/route.ts': ['updateScanStatus('],
  'app/api/files/[...path]/route.ts': ['auth.supabase.storage'],
  'app/api/resume-context/apply/route.ts': ['readApplications(', 'applyResumeCoachInstruction('],
};

const failures = [];

function assertCondition(condition, message) {
  if (!condition) failures.push(message);
}

for (const rel of requiredApiFiles) {
  const abs = join(ROOT, rel);
  assertCondition(existsSync(abs), `Missing required API file: ${rel}`);
  if (!existsSync(abs)) continue;
  const text = await readFile(abs, 'utf-8');
  assertCondition(text.includes('requireApiUser('), `${rel} must call requireApiUser()`);
  assertCondition(text.includes('auth.response'), `${rel} must guard unauthorized with auth.response`);
  if (!rel.includes('/chat/stream/') && !rel.includes('/eval/stream/') && !rel.includes('/docs/generate/') && !rel.includes('/scan/run/') && !rel.includes('/jd/')) {
    const delegateMarkers = scopedByDelegate[rel] ?? [];
    const hasDelegate = delegateMarkers.some((m) => text.includes(m));
    assertCondition(
      hasDelegate || text.includes(".eq(\"user_id\"") || text.includes(".eq('user_id'"),
      `${rel} must scope data by user_id directly or via scoped repository delegate`,
    );
  }
}

const schemaPath = join(ROOT, 'supabase/schema.sql');
assertCondition(existsSync(schemaPath), 'Missing supabase/schema.sql');
if (existsSync(schemaPath)) {
  const schema = await readFile(schemaPath, 'utf-8');
  for (const table of ['profiles', 'resumes', 'applications', 'scan_history', 'reports', 'documents']) {
    assertCondition(
      schema.includes(`alter table public.${table} enable row level security`),
      `RLS must be enabled for table ${table}`,
    );
    assertCondition(
      schema.includes(`${table}_owner_all`) || schema.includes(`${table}_owner`),
      `Owner policy missing for table ${table}`,
    );
  }
}

const middlewarePath = join(ROOT, 'middleware.ts');
assertCondition(existsSync(middlewarePath), 'Missing middleware.ts');
if (existsSync(middlewarePath)) {
  const middleware = await readFile(middlewarePath, 'utf-8');
  assertCondition(
    middleware.includes('APPLYPANDA_LOCKDOWN'),
    'middleware.ts must include APPLYPANDA_LOCKDOWN fail-safe',
  );
}

if (failures.length > 0) {
  console.error('Tenant isolation verification FAILED:\n');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log('Tenant isolation verification PASSED');
