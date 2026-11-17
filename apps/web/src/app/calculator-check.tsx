'use client';

import { add } from '@champsparty/calculator';
import { useState } from 'react';

export function CalculatorCheck() {
  const [value, setValue] = useState(0);

  return (
    <section
      aria-labelledby="calculator-check-title"
      className="flex flex-col gap-4 rounded-xl border border-slate-200 p-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="space-y-1">
        <h2 id="calculator-check-title" className="font-semibold">
          계산 패키지 연결 확인
        </h2>
        <p className="text-sm text-slate-600">
          버튼을 누르면 계산 패키지의 함수로 값을 더합니다.
        </p>
      </div>
      <div className="flex items-center gap-4">
        <output
          aria-label="연결 확인 결과"
          aria-live="polite"
          className="min-w-6 text-center text-2xl font-semibold tabular-nums"
        >
          {value}
        </output>
        <button
          type="button"
          onClick={() => setValue((current) => add(current, 1))}
          className="cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900"
        >
          1 더하기
        </button>
      </div>
    </section>
  );
}
