import { CalculatorCheck } from '@/app/calculator-check';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-12">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          포켓몬 챔피언스 계산기
        </h1>
        <p className="text-slate-600">계산 기능을 준비하고 있습니다.</p>
      </header>
      <CalculatorCheck />
    </main>
  );
}
