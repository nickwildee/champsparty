import 'server-only';

import { hash } from 'node:crypto';
import type { NaverOptions } from 'better-auth/social-providers';

export function createNaverProviderOptions(
  clientId: string,
  clientSecret: string,
): NaverOptions {
  return {
    clientId,
    clientSecret,
    disableDefaultScope: true,
    mapProfileToUser(profile) {
      const id = profile.response?.id;
      // Naver IDs are case-sensitive. Hex stays distinct after email normalization.
      return {
        name: '트레이너',
        email: id ? `${hash('sha256', id, 'hex')}@naver.invalid` : null,
        emailVerified: false,
        image: undefined,
      };
    },
  };
}
