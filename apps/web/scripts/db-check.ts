import { loadEnvConfig } from '@next/env';
import { sql } from 'drizzle-orm';
import { closeDb, getDb } from '../src/server/db';

async function main() {
  try {
    // pnpm runs this command from apps/web. This check uses development env files.
    loadEnvConfig(process.cwd(), true);

    const result = await getDb().execute<{
      ok: number;
      database: string;
      role: string;
    }>(
      sql`select 1 as ok, current_database() as database, current_user as role`,
    );

    const row = result.rows[0];
    if (
      row?.ok !== 1 ||
      row.database !== 'champsparty' ||
      row.role !== 'champsparty_app'
    ) {
      console.error(
        'DB 확인 실패: champsparty DB의 champsparty_app 계정으로 접속해야 합니다.',
      );
      process.exitCode = 1;
      return;
    }

    console.log('DB 연결 확인 성공');
    console.log('DB: champsparty');
    console.log('계정: champsparty_app');
  } catch {
    console.error(
      process.env.DATABASE_URL?.trim()
        ? 'DB 연결 확인 실패: PostgreSQL 실행 상태와 DATABASE_URL 설정을 확인하세요.'
        : 'DB 연결 확인 실패: DATABASE_URL 환경변수가 필요합니다.',
    );
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main().catch(() => {
  console.error('DB 연결 정리 중 오류가 발생했습니다.');
  process.exitCode = 1;
});
