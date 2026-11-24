import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'drizzle-kit';
import generationConfig from './drizzle.config';

const envFile = '.env.migrations.local';
if (!existsSync(envFile)) {
  throw new Error(
    '마이그레이션 설정 파일이 없습니다. .env.migrations.local을 준비하세요.',
  );
}

const url = parseEnv(readFileSync(envFile, 'utf8')).MIGRATION_DATABASE_URL;
if (!url) {
  throw new Error(
    '.env.migrations.local에 MIGRATION_DATABASE_URL이 필요합니다.',
  );
}

const target = URL.parse(url);
if (
  !target ||
  !['postgresql:', 'postgres:'].includes(target.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
  target.pathname !== '/champsparty' ||
  target.username !== 'champsparty_migrator' ||
  target.search
) {
  throw new Error(
    'MIGRATION_DATABASE_URL은 로컬 champsparty DB의 champsparty_migrator 접속 주소여야 합니다. 주소에 쿼리 옵션을 넣지 마세요.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  out: generationConfig.out,
  dbCredentials: { url },
  migrations: { schema: 'drizzle', table: '__drizzle_migrations' },
});
