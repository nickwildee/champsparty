import { CalculatorCheck } from '@/app/calculator-check';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          포켓몬 챔피언스 계산기
        </h1>
        <p className="text-slate-600">
          싱글 배틀 · 한카리아스의 지진 → 메가 메타그로스
        </p>
      </header>
      <CalculatorCheck />
    </main>
  );
}
