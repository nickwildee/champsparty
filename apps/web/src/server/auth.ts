import 'server-only';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import * as schema from './auth-schema';
import { getDb } from './db';
import { createNaverProviderOptions } from './naver';

const dayInSeconds = 24 * 60 * 60;

function createAuth() {
  const baseURL = process.env.BETTER_AUTH_URL?.trim();
  if (!baseURL) {
    throw new Error('BETTER_AUTH_URL 환경변수가 필요합니다.');
  }
  const parsedURL = URL.parse(baseURL);
  if (!parsedURL || !['http:', 'https:'].includes(parsedURL.protocol)) {
    throw new Error('BETTER_AUTH_URL은 HTTP 또는 HTTPS 주소여야 합니다.');
  }

  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('BETTER_AUTH_SECRET에 32자 이상의 비밀값이 필요합니다.');
  }

  const naverClientId = process.env.NAVER_CLIENT_ID?.trim();
  const naverClientSecret = process.env.NAVER_CLIENT_SECRET?.trim();

  return betterAuth({
    baseURL,
    secret,
    database: drizzleAdapter(getDb(), { provider: 'pg', schema }),
    socialProviders: {
      naver:
        naverClientId && naverClientSecret
          ? createNaverProviderOptions(naverClientId, naverClientSecret)
          : undefined,
    },
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: 7 * dayInSeconds,
      updateAge: dayInSeconds,
      cookieCache: { enabled: false },
    },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  return (auth ??= createAuth());
}
